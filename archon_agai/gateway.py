"""Archon Guard gateway (FastAPI). Backs the two frontend windows: Code Editor + Conformance.

    /api/conformance/*            reused Conformance Studio API (canvas works unchanged)
    /api/agai/sessions            create ADK session (codebase + blueprint in state)
    /api/agai/sessions/{id}       state snapshot (audit, narrative, healing report, usage, timings)
    /api/agai/stream/{id}         SSE stream of callback events (ADK, CrewAI, A2A, guardrails)
    /api/agai/audit               run ADK audit pipeline
    /api/agai/heal                ADK -> A2A -> CrewAI healing crew
    /api/agai/apply | /revert     human-in-the-loop apply of verified patches (with backup)
    /api/agai/tree | /file        editor file access, confined to allowed roots

Run:  uvicorn archon_agai.gateway:app --port 8100
"""
import asyncio
import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from archon_agai import engine, events, observability
from archon_agai.config import (ALLOWED_ROOTS, DEFAULT_BLUEPRINT, DEFAULT_CODEBASE, GATEWAY_PORT, RUNS_DIR,
                                require_llm_key)
from archon_agai.guardrails import resolve_allowed_path, screen_user_prompt
from archon_agai.pricing import estimate_cost
from archon_agai.schemas import AuditResult, HealingReport, HealingRequest
from conformance.studio.api import router as conformance_router

observability.setup("archon-guard-gateway")

APP_NAME = "archon-guard"
USER_ID = "reviewer"
session_service = InMemorySessionService()
_runners: Dict[str, Runner] = {}


def _runner(kind: str) -> Runner:
    if kind not in _runners:
        from archon_agai.agent import audit_pipeline, healing_agent  # lazy: spawns MCP servers on first use
        agent = audit_pipeline if kind == "audit" else healing_agent
        _runners[kind] = Runner(app_name=APP_NAME, agent=agent, session_service=session_service)
    return _runners[kind]


app = FastAPI(title="Archon Guard Gateway")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(conformance_router, prefix="/api/conformance", tags=["conformance"])


@app.exception_handler(ValueError)
async def _value_error(_, exc: ValueError):  # guardrail rejections (e.g. path outside allowed roots)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# --------------------------------------------------------------------------- sessions

class SessionReq(BaseModel):
    codebase_path: Optional[str] = None
    blueprint_id: Optional[str] = None


async def _state(sid: str) -> Dict[str, Any]:
    s = await session_service.get_session(app_name=APP_NAME, user_id=USER_ID, session_id=sid)
    if not s:
        raise HTTPException(404, "unknown session")
    return s.state


async def _patch_state(sid: str, delta: Dict[str, Any]) -> None:
    """State changes outside an agent run go through an event so ADK persists them."""
    from google.adk.events import Event, EventActions
    s = await session_service.get_session(app_name=APP_NAME, user_id=USER_ID, session_id=sid)
    await session_service.append_event(s, Event(author="gateway", invocation_id=uuid.uuid4().hex,
                                                actions=EventActions(state_delta=delta)))


@app.post("/api/agai/sessions")
async def create_session(req: SessionReq):
    try:
        root = resolve_allowed_path(req.codebase_path or DEFAULT_CODEBASE)
    except ValueError as e:
        raise HTTPException(400, str(e))
    sid = "s-" + uuid.uuid4().hex[:10]
    await session_service.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=sid, state={
        "session_id": sid, "codebase_path": str(root), "blueprint_id": req.blueprint_id or DEFAULT_BLUEPRINT,
        "timings": {}, "usage": {},
    })
    events.emit(sid, "gateway", "session_created", str(root))
    return {"session_id": sid, "codebase_path": str(root), "blueprint_id": req.blueprint_id or DEFAULT_BLUEPRINT}


@app.get("/api/agai/sessions/{sid}")
async def get_session(sid: str):
    st = dict(await _state(sid))
    st["cost"] = estimate_cost(st.get("usage", {}), (st.get("healing_report") or {}).get("usage", {}))
    return st


@app.get("/api/agai/stream/{sid}")
async def stream(sid: str):
    await _state(sid)
    q = events.subscribe(sid)

    async def gen():
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {ev.model_dump_json()}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            events.unsubscribe(sid, q)
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --------------------------------------------------------------------------- audit (ADK)

class AuditReq(BaseModel):
    session_id: str
    prompt: str = "Audit this codebase for Clean Architecture violations."


async def _run(kind: str, sid: str, text: str) -> str:
    final = ""
    async for ev in _runner(kind).run_async(user_id=USER_ID, session_id=sid,
                                            new_message=types.Content(role="user", parts=[types.Part(text=text)])):
        if ev.content and ev.content.parts:
            t = "".join(p.text or "" for p in ev.content.parts if getattr(p, "text", None))
            if t and ev.is_final_response():
                final = t
    return final


async def _audit_job(sid: str, prompt: str) -> None:
    t0 = time.perf_counter()
    try:
        await _run("audit", sid, prompt)
        st = await _state(sid)
        if "audit_result" not in st and not st.get("guardrail_blocked"):
            # The model skipped the tool: fall back to deterministic ground truth, and record it.
            res, _ = engine.audit(st["codebase_path"], st["blueprint_id"])
            await _patch_state(sid, {"audit_result": res.model_dump(), "audit_fallback": True})
            events.emit(sid, "gateway", "fallback", "agent did not call scan_conformance; used engine directly")
    except Exception as e:
        events.emit(sid, "gateway", "error", f"audit failed: {type(e).__name__}: {e}")
    finally:
        st = await _state(sid)
        await _patch_state(sid, {"timings": {**st.get("timings", {}), "audit_s": round(time.perf_counter() - t0, 2)}})
        events.emit(sid, "gateway", "audit_done", "")


@app.post("/api/agai/audit")
async def audit(req: AuditReq, bg: BackgroundTasks):
    await _state(req.session_id)
    reasons = screen_user_prompt(req.prompt)
    if reasons:  # fast path; the ADK before_agent callback enforces the same rules
        events.emit(req.session_id, "guardrail", "guardrail_block", "user prompt blocked", data={"reasons": reasons})
        raise HTTPException(400, {"blocked": reasons})
    try:
        require_llm_key()
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    await _patch_state(req.session_id, {"audit_result": None, "audit_narrative": None, "healing_report": None})
    bg.add_task(_audit_job, req.session_id, req.prompt)
    return {"accepted": True}


# --------------------------------------------------------------------------- heal (ADK -> A2A -> CrewAI)

class HealReq(BaseModel):
    session_id: str
    max_attempts: int = 3


async def _heal_job(sid: str, max_attempts: int) -> None:
    t0 = time.perf_counter()
    try:
        st = await _state(sid)
        hreq = HealingRequest(request_id=sid, codebase_path=st["codebase_path"], blueprint_id=st["blueprint_id"],
                              audit=AuditResult.model_validate(st["audit_result"]), max_attempts=max_attempts)
        events.emit(sid, "a2a", "a2a_send", "ADK -> ArchonHealingCrew (A2A SendMessage)")
        text = await _run("heal", sid, hreq.model_dump_json())
        report = HealingReport.model_validate_json(_extract_json(text))
        await _patch_state(sid, {"healing_report": report.model_dump()})
        events.emit(sid, "a2a", "a2a_result", f"status={report.status} attempts={report.attempts}",
                    data={"health_after": report.verification.health_after if report.verification else None})
    except Exception as e:
        events.emit(sid, "gateway", "error", f"heal failed: {type(e).__name__}: {e}")
    finally:
        st = await _state(sid)
        await _patch_state(sid, {"timings": {**st.get("timings", {}), "heal_s": round(time.perf_counter() - t0, 2)}})
        events.emit(sid, "gateway", "heal_done", "")


def _extract_json(text: str) -> str:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError(f"no JSON in A2A response: {text[:200]}")
    return text[start:end + 1]


@app.post("/api/agai/heal")
async def heal(req: HealReq, bg: BackgroundTasks):
    st = await _state(req.session_id)
    if not st.get("audit_result"):
        raise HTTPException(400, "run an audit first")
    if not st["audit_result"]["violations"]:
        raise HTTPException(400, "nothing to heal: no violations")
    bg.add_task(_heal_job, req.session_id, max(1, min(req.max_attempts, 5)))
    return {"accepted": True}


# --------------------------------------------------------------------------- apply / revert (human in the loop)

class ApplyReq(BaseModel):
    session_id: str
    paths: Optional[List[str]] = None  # subset of patch paths; None = all


@app.post("/api/agai/apply")
async def apply(req: ApplyReq):
    st = await _state(req.session_id)
    report = HealingReport.model_validate(st.get("healing_report") or {"request_id": req.session_id})
    patches = [p for p in report.patches if req.paths is None or p.path in req.paths]
    if not patches:
        raise HTTPException(400, "no patches to apply")
    root = Path(st["codebase_path"])
    baseline = AuditResult.model_validate(st["audit_result"])
    check = engine.verify(str(root), st["blueprint_id"], patches, baseline)  # re-verify against current files
    if check.guardrail_rejections or check.syntax_errors or check.new_violation_ids:
        raise HTTPException(409, {"reason": "re-verification failed", "verification": check.model_dump()})
    backup = RUNS_DIR / "backups" / req.session_id
    backup.mkdir(parents=True, exist_ok=True)
    created = []
    for p in patches:
        f = root / p.path
        if f.exists() and not (backup / p.path).exists():
            (backup / p.path).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, backup / p.path)
        elif not f.exists():
            created.append(p.path)
    (backup / "_created.json").write_text(json.dumps(created))
    _, errors = engine.apply_patches(root, patches)
    after, _ = engine.audit(str(root), st["blueprint_id"])
    events.emit(req.session_id, "gateway", "applied", f"{len(patches)} patches applied; health {after.metrics.health_score}",
                data={"errors": errors, "provenance": {"session": req.session_id, "paths": [p.path for p in patches]}})
    await _patch_state(req.session_id, {"applied": [p.path for p in patches], "audit_after_apply": after.model_dump()})
    return {"applied": [p.path for p in patches], "errors": errors, "audit": after.model_dump()}


@app.post("/api/agai/revert")
async def revert(req: ApplyReq):
    st = await _state(req.session_id)
    root, backup = Path(st["codebase_path"]), RUNS_DIR / "backups" / req.session_id
    if not backup.exists():
        raise HTTPException(400, "nothing to revert")
    for f in backup.rglob("*.py"):
        shutil.copy2(f, root / f.relative_to(backup))
    for rel in json.loads((backup / "_created.json").read_text() or "[]"):
        (root / rel).unlink(missing_ok=True)
    shutil.rmtree(backup)
    events.emit(req.session_id, "gateway", "reverted", "")
    await _patch_state(req.session_id, {"applied": []})
    return {"reverted": True}


# --------------------------------------------------------------------------- report

@app.get("/api/agai/sessions/{sid}/report.md", response_class=PlainTextResponse)
async def report_md(sid: str):
    from archon_agai.report import render_markdown
    return render_markdown(await get_session(sid))


# --------------------------------------------------------------------------- editor file access

@app.get("/api/agai/tree")
def tree(codebase: Optional[str] = None):
    root = resolve_allowed_path(codebase or DEFAULT_CODEBASE)
    files = sorted(p.relative_to(root).as_posix() for p in root.rglob("*")
                   if p.is_file() and "__pycache__" not in p.parts and not p.name.endswith(".pyc"))
    return {"root": str(root), "files": files}


@app.get("/api/agai/file")
def read_file(path: str, codebase: Optional[str] = None):
    root = resolve_allowed_path(codebase or DEFAULT_CODEBASE)
    f = resolve_allowed_path(path, root)
    if not f.is_file():
        raise HTTPException(404, "not found")
    return {"path": f.relative_to(root).as_posix(), "content": f.read_text(encoding="utf-8")}


class SaveReq(BaseModel):
    path: str
    content: str
    codebase: Optional[str] = None


@app.put("/api/agai/file")
def save_file(req: SaveReq):
    root = resolve_allowed_path(req.codebase or DEFAULT_CODEBASE)
    f = resolve_allowed_path(req.path, root)
    f.write_text(req.content, encoding="utf-8")
    return {"saved": f.relative_to(root).as_posix()}


@app.get("/api/agai/config")
def config():
    return {"defaultCodebase": DEFAULT_CODEBASE, "defaultBlueprint": DEFAULT_BLUEPRINT,
            "allowedRoots": [str(r) for r in ALLOWED_ROOTS]}


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=GATEWAY_PORT)
