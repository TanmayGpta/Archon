"""Tools for ArcGen Pass 2 (edge generation). Read-only wrappers over deterministic logic.

Only two tools on purpose: the prompt already lists every component and requirement, so lookup
tools just burned steps and tokens in live runs (the model called get_node once per step).
The loop the model is steered into: draft all edges -> check_edges -> fix -> submit_edges.
"""

from typing import Any, Dict, List

from pydantic import BaseModel, Field

from app.phase_b.edge_validator import edge_rejection_reason
from app.schemas.architecture import ArchEdge, ArchNode
from app.schemas.patterns import PatternProfile
from app.schemas.requirements import SRSDocument
from app.tools.registry import Tool

CHECK_EDGES = "check_edges"
SUBMIT_EDGES = "submit_edges"


class DraftEdge(BaseModel):
    """The fields the validation rules look at; other edge fields are accepted and ignored."""
    edge_id: str = ""
    source: str
    target: str
    traced_requirements: List[str] = Field(default_factory=list)
    kb_citations: List[str] = Field(default_factory=list)


class CheckEdgesArgs(BaseModel):
    edges: List[DraftEdge] = Field(..., description="All edges drafted so far")


class SubmitEdgesArgs(BaseModel):
    edges: List[ArchEdge] = Field(..., description="The final list of edges")


def build_edge_tools(
    nodes: List[ArchNode],
    srs: SRSDocument,
    primary_pattern: PatternProfile,
) -> List[Tool]:
    valid_node_ids = {n.node_id for n in nodes}
    all_req_ids = {r.req_id for r in srs.all_requirements}

    def check_edges(a: CheckEdgesArgs) -> Dict[str, Any]:
        rejected = []
        connected = set()
        for i, e in enumerate(a.edges):
            reason = edge_rejection_reason(
                e.source, e.target, e.traced_requirements, e.kb_citations, valid_node_ids, all_req_ids,
            )
            if reason is None:
                connected.update((e.source, e.target))
            else:
                rejected.append({"edge": e.edge_id or f"#{i + 1}", "source": e.source,
                                 "target": e.target, "reason": reason})
        # Same as validate_architecture: only accepted edges connect a component.
        orphans = [n.node_id for n in nodes if n.node_id not in connected]
        return {"ok": not rejected and not orphans, "accepted": len(a.edges) - len(rejected),
                "rejected": rejected, "orphans": orphans}

    def submit_edges(a: SubmitEdgesArgs) -> Dict[str, Any]:
        return {"received": len(a.edges)}

    return [
        Tool(CHECK_EDGES,
             "Validate ALL drafted edges in one call against the deterministic rules (endpoints exist, "
             "no self-loop, at least one valid requirement citation, a knowledge base citation) and list "
             "orphan components that no accepted edge connects. Returns {ok, accepted, rejected, orphans}.",
             CheckEdgesArgs, check_edges),
        Tool(SUBMIT_EDGES, "Terminal tool: submit the final list of edges. Call exactly once when done.",
             SubmitEdgesArgs, submit_edges),
    ]
