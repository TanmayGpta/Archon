"""Edge and Citation Validator for ArcGen Phase B.

Enforces citation discipline, validates graph integrity, detects orphan components,
and calculates requirement coverage metrics.
"""

from typing import Iterable, List, Optional, Set, Dict, Tuple
from pydantic import BaseModel, Field
from app.schemas.requirements import SRSDocument
from app.schemas.architecture import ArchNode, ArchEdge, ArchitectureGraph


class ValidationReport(BaseModel):
    """Detailed diagnostic report on generated architecture graph."""
    total_nodes: int
    total_edges: int
    valid_edges_count: int
    rejected_edges_count: int
    rejected_reasons: List[str] = Field(default_factory=list)
    orphan_nodes: List[str] = Field(default_factory=list)
    orphan_ratio: float = 0.0
    covered_requirement_ids: List[str] = Field(default_factory=list)
    uncovered_requirement_ids: List[str] = Field(default_factory=list)
    requirement_coverage_pct: float = 0.0
    is_valid: bool = True


MISSING_REQ_REASON = "Missing valid requirement citation"


def edge_rejection_reason(
    source: str,
    target: str,
    traced_requirements: Iterable[str],
    kb_citations: Iterable[str],
    valid_node_ids: Set[str],
    all_req_ids: Set[str],
) -> Optional[str]:
    """Pure per-edge rule check. Returns why the edge is rejected, or None when it is acceptable."""
    if source not in valid_node_ids or target not in valid_node_ids:
        return f"Invalid endpoint ({source} -> {target})"
    if source == target:
        return f"Self-loop detected on {source}"
    if not [r for r in traced_requirements if r in all_req_ids] and all_req_ids:
        return MISSING_REQ_REASON
    if not list(kb_citations):
        return "Missing knowledge base citation"
    return None


def validate_architecture(
    nodes: List[ArchNode],
    edges: List[ArchEdge],
    srs: SRSDocument,
) -> Tuple[List[ArchEdge], ValidationReport]:
    """Validates edges against nodes and requirements, rejecting uncited or invalid connections."""
    valid_node_ids: Set[str] = {n.node_id for n in nodes}
    all_req_ids: Set[str] = {r.req_id for r in srs.all_requirements}

    valid_edges: List[ArchEdge] = []
    rejected_reasons: List[str] = []

    # 1. Edge Validation & Citation Check
    for edge in edges:
        reason = edge_rejection_reason(
            edge.source, edge.target, edge.traced_requirements, edge.kb_citations,
            valid_node_ids, all_req_ids,
        )
        if reason is not None:
            via = f" ({edge.source} -> {edge.target})" if reason == MISSING_REQ_REASON else ""
            rejected_reasons.append(f"Edge {edge.edge_id}{via} rejected: {reason}")
            continue

        valid_edges.append(edge)

    # 2. Orphan Node Detection
    connected_nodes: Set[str] = set()
    for e in valid_edges:
        connected_nodes.add(e.source)
        connected_nodes.add(e.target)

    orphan_nodes = [n.node_id for n in nodes if n.node_id not in connected_nodes]
    orphan_ratio = len(orphan_nodes) / len(nodes) if nodes else 0.0

    # 3. Requirement Coverage
    covered_reqs: Set[str] = set()
    for n in nodes:
        for r in n.traced_requirements:
            if r in all_req_ids:
                covered_reqs.add(r)
    for e in valid_edges:
        for r in e.traced_requirements:
            if r in all_req_ids:
                covered_reqs.add(r)

    uncovered_reqs = list(all_req_ids - covered_reqs)
    coverage_pct = (len(covered_reqs) / len(all_req_ids) * 100.0) if all_req_ids else 100.0

    report = ValidationReport(
        total_nodes=len(nodes),
        total_edges=len(edges),
        valid_edges_count=len(valid_edges),
        rejected_edges_count=len(rejected_reasons),
        rejected_reasons=rejected_reasons,
        orphan_nodes=orphan_nodes,
        orphan_ratio=orphan_ratio,
        covered_requirement_ids=list(covered_reqs),
        uncovered_requirement_ids=uncovered_reqs,
        requirement_coverage_pct=coverage_pct,
        is_valid=(len(rejected_reasons) == 0 and orphan_ratio < 0.20),
    )

    return valid_edges, report
