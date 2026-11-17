"""Compiles a saved ArcGen architecture graph into a conformance ruleset.

Read-only: the ArcGen file is the source of truth and is never modified. The ruleset is a derived
view holding only what the import checker can verify; every rule keeps the ids of the ArcGen edges
it came from, so a violation can be traced back to the original component, justification and
requirement.

Fields read from the ArcGen output (arcgen_service/app/schemas/architecture.py):
  graph: project_name, style, nodes, edges
  node:  node_id, name, node_type, layer, description, responsibilities
  edge:  edge_id, source, target, justification, traced_requirements
"""

from typing import Any, Dict, List, Literal, Optional, Tuple

Granularity = Literal["layer", "component"]

# Node types backed by source files. Datastores, queues, caches and external systems have no
# modules of their own, so the import checker has nothing to verify for them.
CODE_NODE_TYPES = {"service", "module", "gateway"}
LAYER_ORDER = ["Presentation", "Application", "Domain", "Infrastructure"]
MAX_DESCRIPTION = 700
MAX_REASON = 400


def is_arcgen_graph(data: Any) -> bool:
    """True for an ArcGen architecture graph (nodes + edges) rather than a ruleset (layers + rules)."""
    if not isinstance(data, dict) or "rules" in data:
        return False
    nodes, edges = data.get("nodes"), data.get("edges")
    return (isinstance(nodes, list) and isinstance(edges, list) and bool(nodes)
            and all(isinstance(n, dict) and "node_id" in n for n in nodes))


def _clip(text: str, limit: int) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _unique(items: List[str]) -> List[str]:
    return list(dict.fromkeys(i for i in items if i))


def _component_names(nodes: List[Dict[str, Any]]) -> Dict[str, str]:
    """node_id -> group name; a repeated component name is suffixed with its id to stay unique."""
    seen: Dict[str, int] = {}
    for n in nodes:
        seen[n.get("name") or n["node_id"]] = seen.get(n.get("name") or n["node_id"], 0) + 1
    return {
        n["node_id"]: (name if seen[name] == 1 else f"{name} ({n['node_id']})")
        for n in nodes for name in [n.get("name") or n["node_id"]]
    }


def convert_arcgen(data: Dict[str, Any], granularity: Granularity = "layer") -> Dict[str, Any]:
    """ArcGen graph -> ruleset dict in the shared.schema.ArchitectureRuleset shape.

    granularity="layer":     groups are the tiers (Presentation, Domain, ...); one allow rule per tier pair.
    granularity="component": groups are the components themselves; one allow rule per component pair.
    """
    if not is_arcgen_graph(data):
        raise ValueError("Not an ArcGen architecture graph: expected 'nodes' (each with a node_id) and 'edges'.")

    project = data.get("project_name") or "ArcGen Architecture"
    nodes: List[Dict[str, Any]] = data["nodes"]
    by_id = {n["node_id"]: n for n in nodes}
    names = _component_names(nodes)
    skipped: List[Dict[str, str]] = []

    # 1. Assign each code-bearing component to a group
    group_of: Dict[str, str] = {}
    for n in nodes:
        node_type = str(n.get("node_type") or "").lower()
        if node_type not in CODE_NODE_TYPES:
            skipped.append({"name": names[n["node_id"]], "node_type": node_type or "unknown",
                            "reason": "no source files to check"})
        elif granularity == "component":
            group_of[n["node_id"]] = names[n["node_id"]]
        elif n.get("layer"):
            group_of[n["node_id"]] = str(n["layer"])
        else:
            skipped.append({"name": names[n["node_id"]], "node_type": node_type,
                            "reason": "component has no layer"})

    # 2. Describe each group (the description is what the classifier reads)
    members: Dict[str, List[Dict[str, Any]]] = {}
    for node_id, group in group_of.items():
        members.setdefault(group, []).append(by_id[node_id])

    layers: List[Dict[str, Any]] = []
    for group, group_nodes in members.items():
        if granularity == "component":
            n = group_nodes[0]
            duties = "; ".join(n.get("responsibilities") or [])
            description = f"{n.get('description') or group}" + (f" Responsibilities: {duties}" if duties else "")
            layers.append({"name": group, "description": _clip(description, MAX_DESCRIPTION),
                           "match_patterns": [], "parent_layer": n.get("layer")})
        else:
            parts = "; ".join(f"{names[n['node_id']]}: {n.get('description') or ''}".rstrip(": ") for n in group_nodes)
            layers.append({"name": group, "match_patterns": [],
                           "description": _clip(f"{group} layer of {project}. Components: {parts}", MAX_DESCRIPTION)})
    if granularity == "layer":
        rank = {name: i for i, name in enumerate(LAYER_ORDER)}
        layers.sort(key=lambda l: rank.get(l["name"], len(rank)))  # stable: unknown tiers keep file order

    # 3. One allow rule per pair of groups that an edge connects
    pairs: Dict[Tuple[str, str], Dict[str, List[str]]] = {}
    for e in data["edges"]:
        src, tgt = group_of.get(e.get("source")), group_of.get(e.get("target"))
        if not src or not tgt or src == tgt:
            continue
        slot = pairs.setdefault((src, tgt), {"edges": [], "reasons": [], "requirements": []})
        slot["edges"].append(str(e.get("edge_id") or ""))
        slot["reasons"].append(str(e.get("justification") or "").strip())
        slot["requirements"].extend(e.get("traced_requirements") or [])

    rules = [
        {
            "source_layer": src,
            "target_layer": tgt,
            "type": "allow",
            "reason": _clip(" | ".join(_unique(slot["reasons"])) or f"{src} depends on {tgt} in the generated architecture.",
                            MAX_REASON),
            "severity": "major",
            "derived_from": _unique(slot["edges"]),
            "traced_requirements": _unique(slot["requirements"]),
        }
        for (src, tgt), slot in pairs.items()
    ]

    return {
        "version": "1.0",
        "project_name": project,
        "default_policy": "default-deny",
        "unclassified_policy": "flag_for_review",
        "layers": layers,
        "rules": rules,
        "metadata": {
            "source": "arcgen",
            "style": data.get("style"),
            "granularity": granularity,
            "components": len(nodes),
            "skipped_components": skipped,
        },
    }


def arcgen_rulesets(data: Dict[str, Any]) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """(default ruleset, component-level ruleset or None).

    The default is layer-level whenever the architecture has tiers, because files can be mapped to
    tiers reliably today; the component-level ruleset is kept alongside for the component audit.
    A graph with no tiers (e.g. microservices) only has the component-level form, which is then the default.
    """
    component = convert_arcgen(data, "component")
    layer = convert_arcgen(data, "layer")
    if not layer["layers"]:
        return component, None
    return layer, (component if component["layers"] else None)
