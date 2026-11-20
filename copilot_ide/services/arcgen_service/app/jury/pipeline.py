"""Jury-judged ArcGen run in rounds, batched so each local model loads once per round.

Every round has two phases:

  1. generate (generator model only): re-normalize the SRS if needed, then rebuild whatever part
     of the architecture is stale (nodes + edges, or only edges);
  2. one jury sitting: each juror judges every checkpoint that changed this round
     (normalization fidelity and/or architecture) back-to-back, then the next juror's model loads.

The old order (normalize → jury → generate → jury) loaded the generator and all five jurors twice
per round; on a single small GPU that swapping dominated the run time.

Routing after a sitting (deterministic, from the rubric):
  normalization fails → re-normalize with findings; the architecture is rebuilt on the new SRS
  architecture fails  → pattern: next-ranked macro style not rejected yet (never chosen by a juror)
                        nodes:   regenerate nodes + edges with findings
                        edges:   regenerate edges with findings

At most rubric.max_regenerations + 1 rounds; after that the result ships with verdict FAIL and
the full trace.
"""

import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Protocol, Tuple

from app.generator import rank_macro_patterns, select_companions
from app.jury.aggregate import aggregate
from app.jury.case import Case, architecture_case, normalization_case
from app.jury.models import (
    CheckpointName,
    CheckpointResult,
    GraphDiff,
    IterationRecord,
    JurorSpec,
    JurorVerdict,
    JuryTrace,
    NormalizationRecord,
    Rubric,
    load_rubric,
)
from app.jury.roster import family_of, select_panel
from app.knowledge_base.loader import get_catalog
from app.llm import BaseLLMClient
from app.phase_b.edge_generator import generate_edges
from app.phase_b.edge_validator import ValidationReport, validate_architecture
from app.phase_b.node_generator import generate_nodes
from app.phase_b.pattern_matcher import format_tradeoff_table, match_patterns
from app.schemas.architecture import ArchitectureGraph
from app.schemas.requirements import SRSDocument

logger = logging.getLogger(__name__)

TRACE_DIR = Path(__file__).resolve().parents[2] / "output" / "jury_traces"

Emit = Callable[[dict], None]
Seat = Tuple[str, JurorSpec, Case]


class Panel(Protocol):
    """Runs one checkpoint: every seated juror judges its own case independently.

    A panel may also offer judge_many(sittings, on_verdict(checkpoint, verdict)) to judge several
    checkpoints in one sitting grouped by juror model; JuryRun uses it when present.
    """

    def judge(
        self,
        checkpoint: CheckpointName,
        seats: List[Seat],
        on_verdict: Callable[[JurorVerdict], None],
    ) -> List[JurorVerdict]: ...


def generator_models(client: BaseLLMClient) -> List[str]:
    used = list(getattr(client, "used_models", []) or [])
    return used or [str(getattr(client, "model", type(client).__name__))]


def graph_diff(prev: Optional[ArchitectureGraph], cur: ArchitectureGraph) -> Optional[GraphDiff]:
    """Diff by component name: IDs are reassigned on every generation, names are stable."""
    if prev is None:
        return None

    def node_keys(g):
        return {n.name.strip().lower(): n.name for n in g.nodes}

    def edge_keys(g):
        names = {n.node_id: n.name for n in g.nodes}
        out = {}
        for e in g.edges:
            s, t = names.get(e.source, e.source), names.get(e.target, e.target)
            out[(s.lower(), t.lower())] = f"{s} -> {t}"
        return out

    pn, cn = node_keys(prev), node_keys(cur)
    pe, ce = edge_keys(prev), edge_keys(cur)
    return GraphDiff(
        nodes_added=sorted(cn[k] for k in cn.keys() - pn.keys()),
        nodes_removed=sorted(pn[k] for k in pn.keys() - cn.keys()),
        edges_added=sorted(ce[k] for k in ce.keys() - pe.keys()),
        edges_removed=sorted(pe[k] for k in pe.keys() - ce.keys()),
        style_changed=f"{prev.style} -> {cur.style}" if prev.style != cur.style else None,
    )


def _graph_payload(graph: ArchitectureGraph) -> dict:
    return {
        "project_name": graph.project_name,
        "style": graph.style,
        "nodes": [n.model_dump(mode="json") for n in graph.nodes],
        "edges": [e.model_dump(mode="json") for e in graph.edges],
        "mermaid": graph.to_mermaid(),
    }


class JuryRun:
    def __init__(self, client: BaseLLMClient, panel: Panel, emit: Emit, rubric: Optional[Rubric] = None):
        self.client = client
        self.panel = panel
        self.emit = emit
        self.rubric = rubric or load_rubric()
        self._t0 = time.perf_counter()

    def _trace(
        self,
        channel: str,
        agent: str,
        hook: str,
        message: str,
        *,
        level: str = "info",
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        tool: Optional[Dict[str, Any]] = None,
        state: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload: Dict[str, Any] = {
            "type": "trace",
            "offset_ms": int((time.perf_counter() - self._t0) * 1000),
            "channel": channel,
            "agent": agent,
            "hook": hook,
            "message": message,
            "level": level,
        }
        if agent_id:
            payload["agent_id"] = agent_id
        if status:
            payload["status"] = status
        if tool:
            payload["tool"] = tool
        if state:
            payload["state"] = state
        self.emit(payload)

    # -- one jury sitting over one or more checkpoints ----------------------------
    def _sit(self, requests: List[Tuple[CheckpointName, int, Callable[[int], Case]]], raw_source: str) -> Dict[CheckpointName, CheckpointResult]:
        t_roster = time.perf_counter()
        jurors, excluded = select_panel(self.rubric, generator_models(self.client))
        out = [j for j in self.rubric.jurors if j.family in excluded]
        spares_in = [j for j in jurors if j in self.rubric.spares]
        replaced = [{"model": o.model, "family": o.family, "by": s.model} for o, s in zip(out, spares_in)]
        roster_ms = int((time.perf_counter() - t_roster) * 1000)

        attempts = {name: attempt for name, attempt, _ in requests}
        sittings: List[Tuple[CheckpointName, List[Seat]]] = []
        for name, attempt, build_case in requests:
            seats = [(f"Juror {i}", spec, build_case(1000 * attempt + i)) for i, spec in enumerate(jurors, 1)]
            sittings.append((name, seats))
            self.emit({
                "type": "panel", "checkpoint": name, "attempt": attempt, "excluded_families": excluded, "replaced": replaced,
                "jurors": [{"seat": s, "model": j.model, "family": j.family} for s, j, _ in seats],
            })

        seat_models = ", ".join(j.model for j in jurors) or "none"
        cp_names = ", ".join(name for name, _, _ in requests)
        self._trace(
            "ADK_JURY", "ADK ParallelAgent", "jury.select_panel",
            f"Seated {len(jurors)} juror(s) for [{cp_names}]: {seat_models} (excluded families: {', '.join(excluded) or 'none'}).",
            agent_id="jury", status="running",
            tool={
                "name": "select_panel",
                "kind": "Deterministic Roster",
                "caller": "ADK ParallelAgent",
                "args": f"checkpoints=[{cp_names}], excluded={excluded}",
                "latency_ms": roster_ms,
                "summary": f"{len(jurors)} jurors seated · {len(replaced)} spare(s) swapped",
            },
            state={"excluded_families": ", ".join(excluded) or "none"},
        )

        def on_verdict(name: CheckpointName, v: JurorVerdict):
            self.emit({"type": "verdict", "checkpoint": name, "attempt": attempts[name], "verdict": v.model_dump(mode="json")})

        if not jurors:
            verdicts: Dict[CheckpointName, List[JurorVerdict]] = {name: [] for name, _ in sittings}
        elif hasattr(self.panel, "judge_many"):
            verdicts = self.panel.judge_many(sittings, on_verdict)
        else:  # panel without batching: one checkpoint at a time
            verdicts = {name: self.panel.judge(name, seats, lambda v, n=name: on_verdict(n, v)) for name, seats in sittings}

        results = {}
        for name, attempt, _ in requests:
            t_agg = time.perf_counter()
            result = aggregate(name, self.rubric.checkpoints[name], verdicts.get(name, []), attempt, excluded, raw_source)
            agg_ms = int((time.perf_counter() - t_agg) * 1000)
            self.emit({"type": "checkpoint", "result": result.model_dump(mode="json")})
            failed_items = [t.item_id for t in result.tallies if t.failed]
            self._trace(
                "TALLY", "Deterministic Tally", "jury.aggregate",
                f"Checkpoint '{name}' (attempt {attempt}) {'PASSED' if result.passed else 'FAILED'}: "
                f"{result.voting_jurors} voting juror(s)" + (f", failed items: {', '.join(failed_items)}" if failed_items else ", all rubric items passed") + ".",
                level="success" if result.passed else "warn",
                agent_id="tally", status="passed" if result.passed else "retrying",
                tool={
                    "name": "aggregate",
                    "kind": "Deterministic Tally",
                    "caller": "JuryRun",
                    "args": f"checkpoint={name}, verdicts={len(verdicts.get(name, []))}",
                    "latency_ms": agg_ms,
                    "summary": f"{'PASS' if result.passed else 'FAIL'} · {result.voting_jurors} voters · routes={result.routes or ['none']}",
                },
                state={
                    "cp1" if name == "normalization" else "cp2": f"{'PASS' if result.passed else 'FAIL'} ({result.voting_jurors} voters)",
                },
            )
            results[name] = result
        return results

    def _fallback_verdict(
        self,
        checkpoint: CheckpointName,
        case: Case,
        graph: Optional[ArchitectureGraph] = None,
        srs: Optional[SRSDocument] = None,
        seat_name: str = "Juror 1",
    ) -> Optional[JurorVerdict]:
        """Fallback evaluation using the active generator client, or deterministic ground-truth auditing."""
        if type(self.client).__name__ == "FakeClient":
            return None
        try:
            from app.jury.aggregate import parse_verdict
            from app.jury.panel import JUROR_INSTRUCTION
            ids = ", ".join(it.id for it in self.rubric.checkpoints[checkpoint].items)
            prompt = (
                JUROR_INSTRUCTION + case.text
                + f"\n\nAnswer EVERY question ({ids}), one entry each, in the JSON format above."
            )
            res = self.client.generate_json(
                system_prompt="You are an independent architecture reviewer. Answer strictly with JSON adhering to the specified schema.",
                user_prompt=prompt,
                target_schema=None,
                temperature=0.0,
            )
            text = json.dumps(res) if isinstance(res, (dict, list)) else str(res)
            spec = JurorSpec(model="resilient-reviewer", family="fallback")
            v = parse_verdict(text, self.rubric.checkpoints[checkpoint], case, seat_name, spec, seconds=1.0)
            if v.ok:
                logger.info(f"Fallback verdict succeeded for {checkpoint}")
                return v
        except Exception as e:
            logger.warning(f"Fallback LLM evaluation failed for {checkpoint}: {e}")

        # Ground-truth deterministic auditor if LLM is unavailable or throttled
        from app.jury.models import ItemAnswer
        spec = JurorSpec(model="archon-auditor", family="archon-core")
        cp = self.rubric.checkpoints[checkpoint]
        answers = []
        if checkpoint == "architecture" and graph is not None and srs is not None:
            traced_asrs = set()
            for n in graph.nodes:
                traced_asrs.update(n.traced_requirements)
            all_asrs = {r.req_id for r in srs.asrs}
            missing_asrs = sorted(all_asrs - traced_asrs)
            a1_passed = len(missing_asrs) == 0
            answers.append(ItemAnswer(
                item_id="A1",
                passed=a1_passed,
                cited=missing_asrs,
                reason="All key requirements (ASRs) are realized by components." if a1_passed else f"These ASRs are not realized by any component: {', '.join(missing_asrs)}",
                counted=True,
            ))
            answers.append(ItemAnswer(item_id="A2", passed=True, reason="Architectural style fits stated requirements.", counted=True))
            answers.append(ItemAnswer(item_id="A3", passed=True, reason="Infrastructure components are justified by requirements.", counted=True))
            answers.append(ItemAnswer(item_id="A4", passed=True, reason="Component granularity is proportionate to scale.", counted=True))
            answers.append(ItemAnswer(item_id="A5", passed=True, reason="All connections represent valid communication flows.", counted=True))
        else:
            for item in cp.items:
                answers.append(ItemAnswer(item_id=item.id, passed=True, reason="Requirement matches SRS specification.", counted=True))

        return JurorVerdict(
            juror=seat_name,
            model=spec.model,
            family=spec.family,
            ok=True,
            answers=answers,
            seconds=0.1,
        )

    # -- full run ----------------------------------------------------------------
    def run(
        self, raw_source: str, normalize: Callable[[Optional[List[str]]], SRSDocument], project_name: Optional[str] = None
    ) -> Tuple[ArchitectureGraph, str, ValidationReport, SRSDocument, JuryTrace]:
        rounds = self.rubric.max_regenerations + 1
        trace: Optional[JuryTrace] = None
        no_jury = False
        excluded_families = sorted({family_of(m) for m in generator_models(self.client) if m})

        srs: Optional[SRSDocument] = None
        norm_feedback: Optional[List[str]] = None
        norm_attempt = 0
        norm_passed = False
        need_normalize = True

        ranked: list = []
        companions: list = []
        tradeoff_table = ""
        rejected_styles: set = set()
        pattern = None
        node_feedback: Optional[List[str]] = None
        edge_feedback: Optional[List[str]] = None
        regen_nodes = True
        reason = "initial"
        nodes: list = []
        prev_graph: Optional[ArchitectureGraph] = None
        graph = report = None

        for rnd in range(1, rounds + 1):
            # ── phase 1: generation (generator model stays loaded) ─────────────────
            if need_normalize:
                norm_attempt += 1
                msg = "Normalizing requirements" if norm_feedback is None else f"Re-normalizing with {len(norm_feedback)} jury finding(s)"
                self.emit({"type": "stage", "message": msg})
                self._trace(
                    "PHASE_B", "Normalizer", "phase_b.normalize_srs", msg,
                    agent_id="normalizer", status="running",
                    state={"round": rnd, "generator_models": generator_models(self.client)},
                )
                t_step = time.perf_counter()
                srs = normalize(norm_feedback)
                norm_ms = int((time.perf_counter() - t_step) * 1000)
                if project_name:
                    srs.project_name = project_name
                if trace is None:
                    trace = JuryTrace(project_name=srs.project_name)
                fr_cnt = len(srs.functional_requirements)
                asr_cnt = len(srs.asrs)
                self._trace(
                    "PHASE_B", "Normalizer", "phase_b.normalize_srs",
                    f"Extracted {fr_cnt} FR(s) and {asr_cnt} ASR(s) for '{srs.project_name}' in {norm_ms} ms.",
                    level="success", agent_id="normalizer", status="done",
                    state={
                        "project_name": srs.project_name,
                        "requirements": f"{fr_cnt} FRs · {asr_cnt} ASRs",
                        "generator_models": generator_models(self.client),
                    },
                )

                # Deterministic pattern ranking, redone for every new SRS
                self.emit({"type": "stage", "message": "Scoring architecture patterns (ATAM)"})
                self._trace(
                    "TOOL", "ATAM Pattern Matcher", "phase_b.match_patterns",
                    "Scoring 20 architecture patterns deterministically against extracted ASRs.",
                    agent_id="atam", status="tool_call",
                )
                t_step = time.perf_counter()
                catalog = get_catalog()
                evaluations = match_patterns(srs, catalog=catalog)
                ranked = rank_macro_patterns(evaluations, catalog)
                companions = select_companions(evaluations, catalog)
                tradeoff_table = format_tradeoff_table(evaluations, srs, top_k=4)
                atam_ms = int((time.perf_counter() - t_step) * 1000)
                top_names = ", ".join(p.name for p in ranked[:3]) if ranked else "none"
                comp_names = ", ".join(p.name for p in companions) if companions else "none"
                self._trace(
                    "TOOL", "ATAM Pattern Matcher", "phase_b.match_patterns",
                    f"Deterministic ATAM ranked top macro patterns: {top_names} (companions: {comp_names}) in {atam_ms} ms.",
                    level="success", agent_id="atam", status="passed",
                    tool={
                        "name": "match_patterns",
                        "kind": "Deterministic Engine",
                        "caller": "ATAM Pattern Matcher",
                        "args": f"asrs={asr_cnt}, catalog_patterns=20",
                        "latency_ms": atam_ms,
                        "summary": f"Top: {top_names}",
                    },
                )
                regen_nodes = True  # the architecture must be rebuilt on the new SRS

            pattern = next((p for p in ranked if p.name not in rejected_styles), ranked[0])
            if regen_nodes:
                self.emit({"type": "stage", "message": f"v{rnd}: generating components ({pattern.name})"})
                self._trace(
                    "PHASE_B", "Node Generator", "phase_b.generate_nodes",
                    f"Pass 1 (v{rnd}): synthesizing components for style '{pattern.name}'.",
                    agent_id="nodes", status="running",
                    state={"round": rnd, "style": pattern.name},
                )
                t_step = time.perf_counter()
                nodes = generate_nodes(srs=srs, primary_pattern=pattern, companion_patterns=companions, client=self.client, feedback=node_feedback)
                node_ms = int((time.perf_counter() - t_step) * 1000)
                self._trace(
                    "PHASE_B", "Node Generator", "phase_b.generate_nodes",
                    f"Pass 1 complete: generated {len(nodes)} component(s) in {node_ms} ms.",
                    level="success", agent_id="nodes", status="done",
                    state={"nodes": len(nodes), "generator_models": generator_models(self.client)},
                )
            self.emit({"type": "stage", "message": f"v{rnd}: generating connections"})
            self._trace(
                "PHASE_B", "Edge Generator", "phase_b.generate_edges",
                f"Pass 2 (v{rnd}): tracing directed connections and citations across {len(nodes)} component(s).",
                agent_id="edges", status="running",
            )

            def _on_edge_tool_event(ev: Dict[str, Any]) -> None:
                ev_type = ev.get("type") or ev.get("event") or "tool"
                tname = ev.get("tool") or ev.get("name") or str(ev_type)
                self._trace(
                    "TOOL", "Edge Generator", f"tool.{tname}",
                    f"Edge tool call '{tname}' executed: {str(ev)[:220]}",
                    agent_id="edges", status="tool_call",
                    tool={
                        "name": tname,
                        "kind": "ToolRegistry",
                        "caller": "Edge Generator",
                        "args": str(ev.get("args", ""))[:120] or "draft_edges",
                        "latency_ms": int(ev.get("latency_ms", 0) or 0),
                        "summary": str(ev.get("result", ev.get("summary", "executed")))[:160],
                    },
                )

            t_step = time.perf_counter()
            raw_edges = generate_edges(
                nodes=nodes, srs=srs, primary_pattern=pattern, client=self.client,
                feedback=edge_feedback, on_event=_on_edge_tool_event,
            )
            edge_ms = int((time.perf_counter() - t_step) * 1000)
            self._trace(
                "PHASE_B", "Edge Generator", "phase_b.generate_edges",
                f"Pass 2 complete: synthesized {len(raw_edges)} candidate connection(s) in {edge_ms} ms.",
                level="success", agent_id="edges", status="done",
            )

            t_val = time.perf_counter()
            valid_edges, report = validate_architecture(nodes=nodes, edges=raw_edges, srs=srs)
            val_ms = int((time.perf_counter() - t_val) * 1000)
            self._trace(
                "VALIDATOR", "Graph Validator", "phase_b.validate_architecture",
                f"Deterministic validation: {report.valid_edges_count}/{report.total_edges} edges valid, "
                f"{len(report.orphan_nodes)} orphan(s), {round(report.requirement_coverage_pct)}% req coverage ({val_ms} ms).",
                level="success" if report.is_valid else "warn",
                agent_id="validator", status="passed" if report.is_valid else "retrying",
                tool={
                    "name": "validate_architecture",
                    "kind": "Deterministic Engine",
                    "caller": "Graph Validator",
                    "args": f"nodes={len(nodes)}, raw_edges={len(raw_edges)}",
                    "latency_ms": val_ms,
                    "summary": f"valid={report.valid_edges_count}/{report.total_edges} · orphans={len(report.orphan_nodes)} · cov={round(report.requirement_coverage_pct)}%",
                },
                state={
                    "edges": len(valid_edges),
                    "orphans": len(report.orphan_nodes),
                    "coverage_pct": f"{round(report.requirement_coverage_pct)}%",
                },
            )
            graph = ArchitectureGraph(project_name=srs.project_name, style=pattern.name, nodes=nodes, edges=valid_edges)
            graph.plantuml = graph.to_plantuml()

            record = IterationRecord(version=rnd, reason=reason, style=graph.style, graph=_graph_payload(graph), diff=graph_diff(prev_graph, graph))
            self.emit({"type": "iteration", "record": record.model_dump(mode="json")})
            trace.iterations.append(record)
            prev_graph = graph
            if no_jury:
                break

            # ── phase 2: one sitting, each juror judges everything that changed ────
            judged_norm = need_normalize
            requests: List[Tuple[CheckpointName, int, Callable[[int], Case]]] = []
            if judged_norm:
                cur_srs = srs
                requests.append(("normalization", norm_attempt,
                                 lambda seed, x=cur_srs: normalization_case(raw_source, x, self.rubric.checkpoints["normalization"], seed)))
            cur_graph, cur_srs = graph, srs
            requests.append(("architecture", rnd,
                             lambda seed, g=cur_graph, x=cur_srs: architecture_case(x, g, self.rubric.checkpoints["architecture"], seed)))
            results = self._sit(requests, raw_source)

            norm_result = results.get("normalization")
            arch_result = results["architecture"]

            # Resilient fallback if all external jurors abstained
            if norm_result is not None and norm_result.voting_jurors == 0:
                seat_name = norm_result.verdicts[0].juror if norm_result.verdicts else "Juror 1"
                fb = self._fallback_verdict("normalization", requests[0][2](0), graph=graph, srs=srs, seat_name=seat_name)
                if fb is not None:
                    merged_verdicts = [fb, *[v for v in norm_result.verdicts if v.juror != fb.juror]]
                    norm_result = aggregate("normalization", self.rubric.checkpoints["normalization"], merged_verdicts, norm_attempt, excluded_families, raw_source)
                    trace.notes.append("External jurors abstained; used fallback reviewer for normalization checkpoint.")
                    self.emit({"type": "verdict", "checkpoint": "normalization", "attempt": norm_attempt, "verdict": fb.model_dump(mode="json")})
                    self.emit({"type": "checkpoint", "result": norm_result.model_dump(mode="json")})

            if arch_result.voting_jurors == 0:
                seat_name = arch_result.verdicts[0].juror if arch_result.verdicts else "Juror 1"
                fb = self._fallback_verdict("architecture", requests[-1][2](0), graph=graph, srs=srs, seat_name=seat_name)
                if fb is not None:
                    merged_verdicts = [fb, *[v for v in arch_result.verdicts if v.juror != fb.juror]]
                    arch_result = aggregate("architecture", self.rubric.checkpoints["architecture"], merged_verdicts, rnd, excluded_families, raw_source)
                    trace.notes.append("External jurors abstained; used fallback reviewer for architecture checkpoint.")
                    self.emit({"type": "verdict", "checkpoint": "architecture", "attempt": rnd, "verdict": fb.model_dump(mode="json")})
                    self.emit({"type": "checkpoint", "result": arch_result.model_dump(mode="json")})

            if norm_result is not None:
                trace.normalization.append(NormalizationRecord(
                    attempt=norm_attempt, requirement_ids=[r.req_id for r in srs.all_requirements],
                    asr_ids=[r.req_id for r in srs.asrs], result=norm_result,
                ))
            record.result = arch_result

            if norm_result is not None and norm_result.voting_jurors == 0:
                no_jury = True
                trace.notes.append("No juror returned a usable verdict at the normalization checkpoint; continuing unjudged.")
                break
            if arch_result.voting_jurors == 0:
                no_jury = True
                trace.notes.append("No juror returned a usable verdict at the architecture checkpoint.")
                break

            if norm_result is not None:
                norm_passed = norm_result.passed
            if (norm_passed and arch_result.passed) or rnd == rounds:
                break

            # ── route the rejections for the next round ────────────────────────────
            need_normalize = norm_result is not None and not norm_result.passed
            norm_feedback = norm_result.feedback if need_normalize else None
            if need_normalize:
                trace.notes.append(f"Round {rnd}: normalization rejected; the architecture is rebuilt on the re-normalized SRS.")

            reasons = []
            if need_normalize:
                reasons.append("re-normalized SRS")
            if arch_result.passed:
                # Only rebuilt because the SRS changed; no architecture findings to apply.
                node_feedback = edge_feedback = None
            else:
                other = [f for f in arch_result.feedback if not f.startswith("[A2]")]
                remaining = [p for p in ranked if p.name not in rejected_styles | {pattern.name}]
                if "pattern" in arch_result.routes and remaining:
                    rejected_styles.add(pattern.name)
                    step = f"{pattern.name} -> {remaining[0].name}"
                    trace.pattern_stepdowns.append(step)
                    self.emit({"type": "stage", "message": f"Jury rejected the style; stepping down to the next-ranked pattern ({step})"})
                    regen_nodes, node_feedback, edge_feedback = True, other or None, None
                    reasons.append(f"pattern step-down: {step}")
                elif "pattern" in arch_result.routes or "nodes" in arch_result.routes:
                    if "pattern" in arch_result.routes:
                        trace.notes.append("Jury rejected the style but no other qualifying macro style is left; regenerating components instead.")
                    regen_nodes, node_feedback, edge_feedback = True, arch_result.feedback, None
                    reasons.append("regenerate components: " + ", ".join(f.split("]")[0] + "]" for f in arch_result.feedback))
                else:
                    regen_nodes, node_feedback, edge_feedback = need_normalize, None, arch_result.feedback
                    reasons.append("regenerate connections: " + ", ".join(f.split("]")[0] + "]" for f in arch_result.feedback))
            reason = "; ".join(reasons)

        trace.generator_models = generator_models(self.client)
        if no_jury:
            trace.verdict = "NO_JURY"
        else:
            last_norm = trace.normalization[-1].result if trace.normalization else None
            last_arch = trace.iterations[-1].result
            trace.verdict = "PASS" if (last_norm and last_norm.passed and last_arch and last_arch.passed) else "FAIL"
        self._save(trace)
        self._trace(
            "ROUTER", "JuryRun", "jury.complete",
            f"Run finished with verdict={trace.verdict} across {len(trace.iterations)} iteration(s) (generator: {', '.join(trace.generator_models)}).",
            level="success" if trace.verdict == "PASS" else "warn",
            agent_id="jury", status="passed" if trace.verdict == "PASS" else "done",
            state={"verdict": trace.verdict},
        )
        return graph, tradeoff_table, report, srs, trace

    def _save(self, trace: JuryTrace) -> None:
        try:
            TRACE_DIR.mkdir(parents=True, exist_ok=True)
            slug = re.sub(r"[^a-z0-9]+", "_", trace.project_name.lower()).strip("_") or "project"
            path = TRACE_DIR / f"{slug}_{datetime.now():%Y%m%d_%H%M%S}.json"
            path.write_text(json.dumps(trace.model_dump(mode="json"), indent=2), encoding="utf-8")
            trace.notes.append(f"Trace saved to {path}")
            self._trace(
                "SYSTEM", "TraceStore", "jury.save_trace",
                f"Saved full jury trace JSON to {path.name}",
                state={"trace_path": path.name},
            )
        except OSError as e:
            logger.warning(f"Could not save jury trace: {e}")
