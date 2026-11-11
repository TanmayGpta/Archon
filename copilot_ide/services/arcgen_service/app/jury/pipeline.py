"""Jury-judged ArcGen run: two checkpoints, bounded regeneration, deterministic pattern step-down.

  normalize ──► Checkpoint 1 (normalized SRS vs. raw SRS) ──fail──► re-normalize with findings
      │ pass / out of attempts
  ATAM pattern ranking (deterministic)
      │
  nodes ► edges ► validate ──► Checkpoint 2 (architecture) ──fail──► route by rubric:
                                    pattern → next-ranked macro style (never chosen by a juror)
                                    nodes   → regenerate nodes + edges with findings
                                    edges   → regenerate edges with findings

Each checkpoint allows rubric.max_regenerations retries; after that the result ships with
verdict FAIL and the full trace.
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional, Protocol, Tuple

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
from app.jury.roster import select_panel
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


class Panel(Protocol):
    """Runs one checkpoint: every seated juror judges its own case independently."""

    def judge(
        self,
        checkpoint: CheckpointName,
        seats: List[Tuple[str, JurorSpec, Case]],
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

    # -- one checkpoint sitting ------------------------------------------------
    def _sit(self, name: CheckpointName, attempt: int, build_case: Callable[[int], Case], raw_source: str) -> CheckpointResult:
        checkpoint = self.rubric.checkpoints[name]
        jurors, excluded = select_panel(self.rubric, generator_models(self.client))
        seats = [(f"Juror {i}", spec, build_case(1000 * attempt + i)) for i, spec in enumerate(jurors, 1)]
        out = [j for j in self.rubric.jurors if j.family in excluded]
        spares_in = [j for j in jurors if j in self.rubric.spares]
        replaced = [{"model": o.model, "family": o.family, "by": s.model} for o, s in zip(out, spares_in)]
        self.emit({
            "type": "panel", "checkpoint": name, "attempt": attempt, "excluded_families": excluded, "replaced": replaced,
            "jurors": [{"seat": s, "model": j.model, "family": j.family} for s, j, _ in seats],
        })

        def on_verdict(v: JurorVerdict):
            self.emit({"type": "verdict", "checkpoint": name, "attempt": attempt, "verdict": v.model_dump(mode="json")})

        verdicts = self.panel.judge(name, seats, on_verdict) if seats else []
        result = aggregate(name, checkpoint, verdicts, attempt, excluded, raw_source)
        self.emit({"type": "checkpoint", "result": result.model_dump(mode="json")})
        return result

    # -- full run ----------------------------------------------------------------
    def run(
        self, raw_source: str, normalize: Callable[[Optional[List[str]]], SRSDocument], project_name: Optional[str] = None
    ) -> Tuple[ArchitectureGraph, str, ValidationReport, SRSDocument, JuryTrace]:
        max_regen = self.rubric.max_regenerations

        # Checkpoint 1: normalization fidelity
        self.emit({"type": "stage", "message": "Normalizing requirements"})
        srs = normalize(None)
        if project_name:
            srs.project_name = project_name
        trace = JuryTrace(project_name=srs.project_name)
        no_jury = False
        for attempt in range(1, max_regen + 2):
            result = self._sit("normalization", attempt, lambda seed: normalization_case(raw_source, srs, self.rubric.checkpoints["normalization"], seed), raw_source)
            trace.normalization.append(NormalizationRecord(
                attempt=attempt, requirement_ids=[r.req_id for r in srs.all_requirements],
                asr_ids=[r.req_id for r in srs.asrs], result=result,
            ))
            if result.voting_jurors == 0:
                no_jury = True
                trace.notes.append("No juror returned a usable verdict at the normalization checkpoint; continuing unjudged.")
                break
            if result.passed or attempt > max_regen:
                break
            self.emit({"type": "stage", "message": f"Re-normalizing with {len(result.feedback)} jury finding(s)"})
            srs = normalize(result.feedback)
            if project_name:
                srs.project_name = project_name

        # Deterministic pattern ranking
        self.emit({"type": "stage", "message": "Scoring architecture patterns (ATAM)"})
        catalog = get_catalog()
        evaluations = match_patterns(srs, catalog=catalog)
        ranked = rank_macro_patterns(evaluations, catalog)
        companions = select_companions(evaluations, catalog)
        tradeoff_table = format_tradeoff_table(evaluations, srs, top_k=4)

        # Checkpoint 2: architecture
        pattern_idx = 0
        node_feedback: Optional[List[str]] = None
        edge_feedback: Optional[List[str]] = None
        regen_nodes = True
        reason = "initial"
        nodes = []
        prev_graph: Optional[ArchitectureGraph] = None
        graph = report = None
        arch_attempts = 1 if no_jury else max_regen + 1
        for attempt in range(1, arch_attempts + 1):
            pattern = ranked[pattern_idx]
            if regen_nodes:
                self.emit({"type": "stage", "message": f"v{attempt}: generating components ({pattern.name})"})
                nodes = generate_nodes(srs=srs, primary_pattern=pattern, companion_patterns=companions, client=self.client, feedback=node_feedback)
            self.emit({"type": "stage", "message": f"v{attempt}: generating connections"})
            raw_edges = generate_edges(nodes=nodes, srs=srs, primary_pattern=pattern, client=self.client, feedback=edge_feedback)
            valid_edges, report = validate_architecture(nodes=nodes, edges=raw_edges, srs=srs)
            graph = ArchitectureGraph(project_name=srs.project_name, style=pattern.name, nodes=nodes, edges=valid_edges)
            graph.plantuml = graph.to_plantuml()

            record = IterationRecord(version=attempt, reason=reason, style=graph.style, graph=_graph_payload(graph), diff=graph_diff(prev_graph, graph))
            self.emit({"type": "iteration", "record": record.model_dump(mode="json")})
            trace.iterations.append(record)
            prev_graph = graph
            if no_jury:
                break

            result = self._sit("architecture", attempt, lambda seed: architecture_case(srs, graph, self.rubric.checkpoints["architecture"], seed), raw_source)
            record.result = result
            if result.voting_jurors == 0:
                no_jury = True
                trace.notes.append("No juror returned a usable verdict at the architecture checkpoint.")
                break
            if result.passed or attempt == arch_attempts:
                break

            # Route the rejection (deterministic, from the rubric)
            other = [f for f in result.feedback if not f.startswith("[A2]")]
            if "pattern" in result.routes and pattern_idx + 1 < len(ranked):
                pattern_idx += 1
                step = f"{pattern.name} -> {ranked[pattern_idx].name}"
                trace.pattern_stepdowns.append(step)
                self.emit({"type": "stage", "message": f"Jury rejected the style; stepping down to the next-ranked pattern ({step})"})
                regen_nodes, node_feedback, edge_feedback = True, other or None, None
                reason = f"pattern step-down: {step}"
            elif "pattern" in result.routes or "nodes" in result.routes:
                if "pattern" in result.routes:
                    trace.notes.append("Jury rejected the style but no other qualifying macro style is left; regenerating components instead.")
                regen_nodes, node_feedback, edge_feedback = True, result.feedback, None
                reason = "regenerate components: " + ", ".join(f.split("]")[0] + "]" for f in result.feedback)
            else:
                regen_nodes, node_feedback, edge_feedback = False, None, result.feedback
                reason = "regenerate connections: " + ", ".join(f.split("]")[0] + "]" for f in result.feedback)

        trace.generator_models = generator_models(self.client)
        if no_jury:
            trace.verdict = "NO_JURY"
        else:
            last_norm = trace.normalization[-1].result
            last_arch = trace.iterations[-1].result
            trace.verdict = "PASS" if (last_norm and last_norm.passed and last_arch and last_arch.passed) else "FAIL"
        self._save(trace)
        return graph, tradeoff_table, report, srs, trace

    def _save(self, trace: JuryTrace) -> None:
        try:
            TRACE_DIR.mkdir(parents=True, exist_ok=True)
            slug = re.sub(r"[^a-z0-9]+", "_", trace.project_name.lower()).strip("_") or "project"
            path = TRACE_DIR / f"{slug}_{datetime.now():%Y%m%d_%H%M%S}.json"
            path.write_text(json.dumps(trace.model_dump(mode="json"), indent=2), encoding="utf-8")
            trace.notes.append(f"Trace saved to {path}")
        except OSError as e:
            logger.warning(f"Could not save jury trace: {e}")
