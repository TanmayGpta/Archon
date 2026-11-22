"""Background healing job registry and SSE stream runner (ArcGen job pattern)."""
from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Dict, List, Optional

from conformance.healing.agent import DEFAULT_TIME_BUDGET_S, build_healing_graph
from conformance.healing.sandbox import filter_eligible_violations
from conformance.healing.schemas import (
    FileDiffPreview,
    FilePatch,
    HealingPlan,
    HealingReport,
    HealJobRequest,
    PatchSet,
    VerificationResult,
)
from conformance.studio.service import ROOT_DIR, ConformanceService, resolve_blueprint, resolve_scan_dir

MAX_JOBS = 20
FINISHED_TTL_S = 2 * 3600
POLL_S = 0.25
TERMINAL_EVENTS = {"complete", "error"}


class HealJob:
    """Thread-safe event buffer and pauseable LangGraph handle for one healing run."""

    def __init__(self, req: HealJobRequest):
        self.id = uuid.uuid4().hex[:12]
        self.thread_id = f"heal_{self.id}"
        self.request = req
        self.events: List[Dict[str, Any]] = []
        self.status: str = "running"
        self.done: bool = False
        self.created: float = time.time()
        self.finished: Optional[float] = None
        self.report: Optional[HealingReport] = None
        self.graph: Any = None
        self.config: Dict[str, Any] = {"configurable": {"thread_id": self.thread_id}}
        self._lock = threading.Lock()

    def emit(
        self,
        event_type: str,
        message: str = "",
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        with self._lock:
            if self.done:
                return
            clean_data = dict(data) if isinstance(data, dict) else data
            agent = None
            kind = event_type
            if isinstance(clean_data, dict):
                if "_agent" in clean_data:
                    agent = clean_data.pop("_agent")
                if "_kind" in clean_data:
                    kind = clean_data.pop("_kind")
            payload: Dict[str, Any] = {
                "type": event_type,
                "kind": kind,
                "message": message,
                "ts": time.time(),
            }
            if agent:
                payload["agent"] = agent
            if clean_data is not None and (not isinstance(clean_data, dict) or clean_data):
                payload["data"] = clean_data
            self.events.append(payload)
            if event_type in TERMINAL_EVENTS:
                self.done = True
                self.finished = time.time()

    def snapshot(self, start: int):
        with self._lock:
            return self.events[start:], self.done, len(self.events)

    def info(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "job_id": self.id,
                "status": self.status,
                "done": self.done,
                "events": len(self.events),
                "created": self.created,
                "finished": self.finished,
                "report": self.report.model_dump() if self.report else None,
            }


_jobs: Dict[str, HealJob] = {}
_jobs_lock = threading.Lock()


def _prune() -> None:
    now = time.time()
    for jid, job in list(_jobs.items()):
        if job.done and job.finished and now - job.finished > FINISHED_TTL_S:
            del _jobs[jid]
    finished = sorted((j for j in _jobs.values() if j.done), key=lambda j: j.finished or 0)
    while len(_jobs) > MAX_JOBS and finished:
        del _jobs[finished.pop(0).id]


def get_heal_job(job_id: str) -> Optional[HealJob]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _execute_heal_job(
    job: HealJob,
    plan_fn: Optional[Callable[[Dict[str, Any]], HealingPlan]] = None,
    patch_fn: Optional[Callable[[Dict[str, Any]], PatchSet]] = None,
) -> None:
    req = job.request
    try:
        service = ConformanceService(str(ROOT_DIR))
        scan_dir = resolve_scan_dir(req.codebase_path, Path(ROOT_DIR), fetch=False)
        job.emit(
            "start",
            f"Auditing baseline for {scan_dir.name} ({req.blueprint_id or 'archon_architecture'})...",
            {"_agent": "AssessorFilter", "_kind": "tool_start", "codebase": str(scan_dir), "blueprint_id": req.blueprint_id},
        )

        baseline = service.run_audit(
            target_path=str(scan_dir),
            blueprint_id=req.blueprint_id,
            custom_ruleset=req.custom_ruleset,
            include_external=req.include_external,
            persist_session=False,
        )
        if baseline.get("status") != "success":
            raise ValueError(baseline.get("error", "Baseline audit failed"))

        blueprint = resolve_blueprint(req.blueprint_id, req.custom_ruleset)
        job.emit(
            "assess",
            f"Checking violation eligibility against '{blueprint.get('name') or blueprint.get('id')}'...",
            {
                "_agent": "AssessorFilter",
                "_kind": "agent_start",
                "blueprint_id": blueprint.get("id"),
                "health_before": baseline.get("metrics", {}).get("healthScore"),
                "violations_count": len(baseline.get("violations") or []),
            },
        )
        eligible, skipped = filter_eligible_violations(
            scan_dir=scan_dir,
            audit_data=baseline,
            mode=req.mode,
            target_violation_id=req.violation_id,
            provider=req.provider,
            custom_ruleset=req.custom_ruleset,
        )
        job.emit(
            "eligible",
            f"{len(eligible)} eligible violation(s), {len(skipped)} skipped",
            {
                "_agent": "AssessorFilter",
                "_kind": "tool_end",
                "eligible": [f"{v.get('source_module')}->{v.get('target_module')}" for v in eligible],
                "skipped": skipped,
            },
        )

        if not eligible:
            reason = skipped[0]["reason"] if skipped else "No fixable violations in scope."
            report = HealingReport(
                status="failed",
                codebase=str(scan_dir),
                blueprint_id=blueprint.get("id") or (req.blueprint_id or "custom"),
                skipped_violations=skipped,
                summary=f"Skipped: {reason}",
            )
            job.report = report
            job.status = "failed"
            job.emit("complete", report.summary, {"_agent": "AssessorFilter", "_kind": "error", "report": report.model_dump()})
            return

        graph = build_healing_graph(
            plan_fn=plan_fn,
            patch_fn=patch_fn,
            provider=req.provider,
            model_override=req.model,
            emit_fn=lambda kind, msg, data=None: job.emit(kind, msg, data),
        )
        job.graph = graph

        init_state = {
            "codebase_dir": str(scan_dir),
            "blueprint_id": blueprint.get("id") or (req.blueprint_id or "custom"),
            "blueprint_name": blueprint.get("name") or "Architecture Blueprint",
            "ruleset": blueprint.get("ruleset") or {},
            "custom_ruleset": req.custom_ruleset,
            "include_external": req.include_external,
            "baseline_audit": baseline,
            "target_violations": eligible,
            "skipped_violations": skipped,
            "attempt": 0,
            "max_attempts": req.max_attempts,
            "started_at": time.monotonic(),
            "time_budget_s": DEFAULT_TIME_BUDGET_S,
        }

        # Runs up to `interrupt_before=["finalize"]` without mutating workspace files.
        for _ in graph.stream(init_state, job.config, stream_mode="updates"):
            pass

        final_state = graph.get_state(job.config).values
        report = HealingReport(
            status=final_state.get("status", "failed"),
            codebase=str(scan_dir),
            blueprint_id=init_state["blueprint_id"],
            target_violation_ids=final_state.get("target_ids") or [],
            skipped_violations=skipped,
            plan=HealingPlan.model_validate(final_state["plan"]) if final_state.get("plan") else None,
            patches=[FilePatch.model_validate(p) for p in (final_state.get("patches") or [])],
            previews=[FileDiffPreview.model_validate(p) for p in (final_state.get("previews") or [])],
            verification=VerificationResult.model_validate(final_state["verification"]) if final_state.get("verification") else None,
            attempts=int(final_state.get("attempt") or 0),
            summary=final_state.get("summary") or "",
        )
        job.report = report
        if report.previews:
            job.status = "awaiting_approval"
            job.emit("complete", report.summary, {"report": report.model_dump()})
        else:
            # Nothing left awaiting approval: finalize cleanly.
            graph.invoke(None, job.config)
            job.status = "failed"
            job.emit("complete", report.summary or "Healing did not pass verification.", {"report": report.model_dump()})
    except Exception as exc:
        job.status = "error"
        job.emit("error", f"{type(exc).__name__}: {exc}")


def start_heal_job(
    req: HealJobRequest,
    plan_fn: Optional[Callable[[Dict[str, Any]], HealingPlan]] = None,
    patch_fn: Optional[Callable[[Dict[str, Any]], PatchSet]] = None,
) -> HealJob:
    """Create and launch a background healing job, returning its handle immediately."""
    job = HealJob(req)
    with _jobs_lock:
        _prune()
        _jobs[job.id] = job
    worker = threading.Thread(
        target=_execute_heal_job,
        args=(job, plan_fn, patch_fn),
        daemon=True,
        name=f"heal-{job.id}",
    )
    worker.start()
    return job


def resolve_heal_job(job_id: str, approved: bool, applied_files: Optional[List[str]] = None) -> Dict[str, Any]:
    """Resume the paused LangGraph thread after the user accepts or rejects diff previews."""
    job = get_heal_job(job_id)
    if not job:
        raise KeyError(f"Heal job '{job_id}' not found")
    decision = "approved" if approved else "rejected"
    if job.graph is not None:
        try:
            job.graph.update_state(job.config, {"decision": decision})
            job.graph.invoke(None, job.config)
        except Exception:
            pass
    job.status = decision
    return {
        "status": "success",
        "job_id": job.id,
        "decision": decision,
        "applied_files": applied_files or [],
    }


async def follow_heal_job(job: HealJob, start: int = 0) -> AsyncIterator[str]:
    """SSE stream yielding replayable healing job events until completion."""
    idx = max(0, start)
    while True:
        new_events, done, total = job.snapshot(idx)
        for i, event in enumerate(new_events, idx):
            yield f"data: {json.dumps({**event, 'seq': i}, default=str)}\n\n"
        idx = total
        if done:
            return
        await asyncio.sleep(POLL_S)
