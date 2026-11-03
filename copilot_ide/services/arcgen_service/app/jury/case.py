"""Builds the blind, per-juror case files.

Each juror gets the same facts in a different order (shuffled with a per-juror seed) so that
position bias does not line up across the panel. Nothing in a case names the generator model.
The case also carries the set of IDs a juror may cite, so invented citations can be dropped.
"""

import random
from dataclasses import dataclass, field
from typing import Dict, List, Set

from app.schemas.architecture import ArchitectureGraph
from app.schemas.requirements import SRSDocument
from app.jury.models import Checkpoint


@dataclass
class Case:
    text: str
    valid_ids: Dict[str, Set[str]] = field(default_factory=dict)  # cite kind -> IDs that exist


def _shuffled(items: list, seed: int) -> list:
    out = list(items)
    random.Random(seed).shuffle(out)
    return out


def raw_lines(raw_source: str) -> List[str]:
    return [ln.strip() for ln in raw_source.splitlines() if ln.strip()]


def _req_line(r) -> str:
    metric = f" [{r.metric}: {r.comparator or ''}{r.target_value or ''}{r.unit or ''}]" if r.metric else ""
    return f"- {r.req_id} ({r.req_type.value}): {r.raw_text}{metric}"


def _questions(checkpoint: Checkpoint) -> str:
    return "\n".join(f"{it.id}. {it.question} ({it.cite_help})" for it in checkpoint.items)


def normalization_case(raw_source: str, srs: SRSDocument, checkpoint: Checkpoint, seed: int) -> Case:
    lines = raw_lines(raw_source)
    raw_block = "\n".join(f"L{i}: {ln}" for i, ln in enumerate(lines, 1))
    reqs = _shuffled(srs.all_requirements, seed)
    req_block = "\n".join(_req_line(r) for r in reqs) or "(none)"
    text = (
        f"RAW SRS (numbered lines):\n{raw_block}\n\n"
        f"NORMALIZED REQUIREMENTS:\n{req_block}\n\n"
        f"QUESTIONS:\n{_questions(checkpoint)}"
    )
    return Case(
        text=text,
        valid_ids={
            "raw_lines": {f"L{i}" for i in range(1, len(lines) + 1)},
            "requirements": {r.req_id for r in srs.all_requirements},
            "asrs": {r.req_id for r in srs.asrs},
        },
    )


def architecture_case(srs: SRSDocument, graph: ArchitectureGraph, checkpoint: Checkpoint, seed: int) -> Case:
    reqs = _shuffled(srs.all_requirements, seed)
    nodes = _shuffled(graph.nodes, seed + 1)
    edges = _shuffled(graph.edges, seed + 2)
    names = {n.node_id: n.name for n in graph.nodes}
    req_block = "\n".join(_req_line(r) for r in reqs) or "(none)"
    node_block = "\n".join(
        f"- {n.node_id} {n.name} [{n.node_type.value}, {n.layer or '-'}]: {n.description} "
        f"(traces: {', '.join(n.traced_requirements) or '-'})"
        for n in nodes
    ) or "(none)"
    edge_block = "\n".join(
        f"- {e.edge_id}: {e.source} {names.get(e.source, '?')} -> {e.target} {names.get(e.target, '?')} "
        f"[{e.edge_type.value}, {e.protocol or '-'}] (traces: {', '.join(e.traced_requirements) or '-'})"
        for e in edges
    ) or "(none)"
    text = (
        f"REQUIREMENTS:\n{req_block}\n\n"
        f"ARCHITECTURAL STYLE: {graph.style}\n\n"
        f"COMPONENTS:\n{node_block}\n\n"
        f"CONNECTIONS:\n{edge_block}\n\n"
        f"QUESTIONS:\n{_questions(checkpoint)}"
    )
    return Case(
        text=text,
        valid_ids={
            "requirements": {r.req_id for r in srs.all_requirements},
            "asrs": {r.req_id for r in srs.asrs},
            "nodes": {n.node_id for n in graph.nodes},
            "edges": {e.edge_id for e in graph.edges},
        },
    )
