"""Archon Conformance Checking Service.
Runs dependency extraction, cycle analysis, layer classification, and architectural rule verification.
Produces payload for the 60 FPS HTML5 Canvas engine and Next.js HUD.
"""

import os
import sys
import math
from pathlib import Path
from typing import Dict, List, Any, Optional, Set
import networkx as nx

# Add Archon root to sys.path
ROOT_DIR = Path("/workspace") if Path("/workspace/conformance").exists() else Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from conformance.extraction import extract_project_dependencies
from conformance.graph import build_dependency_graph, find_cycles, STDLIB_MODULES
from conformance.checker import check_architecture, ArchitecturalViolation, ConformanceReport
from conformance.studio.blueprints import get_blueprint_by_id, load_available_blueprints

LAYER_COLORS = {
    "Presentation": "#e8ff00",    # Signal neon yellow (Company)
    "Application": "#4f9dff",     # Electric cobalt blue (Government)
    "Domain": "#6fd38a",          # Emerald mint green (Organization)
    "Infrastructure": "#b48cff",  # Radiant lavender purple (Country)
    "Observability": "#a7d8e0",   # Luminous ice cyan (Person)
    "External": "#ff5c2b",        # Vibrant neon orange (Fund/Weapon)
    "Stdlib": "#e2e2da",          # Diamond ivory platinum (Contract/Deal)
    "Unclassified": "#8b8b86"     # Muted gray (Aggregate)
}

def match_layer_by_patterns(module_name: str, layers_def: List[Dict[str, Any]]) -> Optional[str]:
    """Matches a module name against blueprint regex/glob patterns."""
    import fnmatch
    mod_lower = module_name.lower()
    for layer in layers_def:
        patterns = layer.get("match_patterns", [])
        for pattern in patterns:
            p_clean = pattern.lower()
            if fnmatch.fnmatch(mod_lower, p_clean):
                return layer["name"]
    return None

def heuristic_layer_classify(module_name: str) -> str:
    """Intelligent fallback layer classifier when blueprint patterns don't explicitly match."""
    parts = module_name.lower().split(".")
    base = parts[-1]
    full = module_name.lower()

    # A package explicitly named after a layer (e.g. domain/ports.py) wins over file-name keywords.
    explicit = {"domain": "Domain", "application": "Application",
                "presentation": "Presentation", "infrastructure": "Infrastructure"}
    for part in parts[:-1]:
        if part in explicit:
            return explicit[part]

    # Only true UI / CLI entrypoints are Presentation
    if base in ["app", "main", "cli", "interactive_cli"] and any(k in full for k in ["ui", "frontend", "cli", "shared"]):
        return "Presentation"
    if any(k in base for k in ["agent", "service", "workflow", "use_case", "pipeline", "orchestrat", "process", "generate", "heal", "evaluator", "judge", "ablation", "elicitation", "generator", "flow"]):
        return "Application"
    if any(k in base for k in ["model", "entity", "schema", "domain", "check", "extract", "graph", "core", "rule", "scorer", "metric", "parser", "catalog", "validator", "pattern"]):
        return "Domain"
    if any(k in base for k in ["db", "repo", "store", "client", "adapter", "sql", "redis", "visual", "driver", "util", "tool", "config", "chunker", "scip", "search", "loader", "workspace", "storage", "data"]):
        return "Infrastructure"
    if any(k in base for k in ["monitor", "telemetry", "log", "trace", "health"]):
        return "Observability"
        
    return "Application"


def normalize_target_path(p_str: Optional[str], default_root: Path) -> Path:
    """Safely normalizes Windows and Linux paths across host and Docker container mounts."""
    if not p_str or not p_str.strip():
        return default_root
    clean = p_str.strip().strip('"').strip("'")
    
    # 1. Direct check
    direct = Path(clean)
    if direct.exists():
        return direct.resolve()
        
    # 2. Check mounted targets directory (e.g. /workspace/targets/FinSight)
    basename = Path(clean.replace('\\', '/')).name
    target_candidates = [
        Path("/workspace/targets") / basename,
        default_root / "targets" / basename,
        default_root.parent / "targets" / basename,
        Path("/workspace") / clean.replace('\\', '/'),
        default_root / clean.replace('\\', '/')
    ]
    for tc in target_candidates:
        if tc.exists():
            return tc.resolve()

    # 3. Windows drive translation for Linux Docker (e.g. C:\Users\... -> /mnt/c/Users/...)
    if len(clean) >= 2 and clean[1] == ':':
        drive = clean[0].lower()
        sub = clean[2:].replace('\\', '/')
        if sub.startswith('/'):
            sub = sub[1:]
        candidates = [
            Path(f"/mnt/{drive}/{sub}"),
            Path(f"/{drive}/{sub}"),
            Path(f"/host_{drive}/{sub}"),
            Path(f"/workspace/{sub}")
        ]
        for c in candidates:
            if c.exists():
                return c.resolve()

    # 4. Relative to workspace root
    rel = (default_root / clean).resolve()
    if rel.exists():
        return rel

    return direct.resolve()


class ConformanceService:
    def __init__(self, workspace_root: Optional[str] = None):
        self.workspace_root = Path(workspace_root or ROOT_DIR).resolve()

    def run_audit(
        self,
        target_path: Optional[str] = None,
        blueprint_id: Optional[str] = "archon_architecture",
        custom_ruleset: Optional[Dict[str, Any]] = None,
        include_external: bool = True
    ) -> Dict[str, Any]:
        """Runs an end-to-end architectural conformance audit."""
        scan_dir = normalize_target_path(target_path, self.workspace_root)
        if not scan_dir.exists():
            return {
                "status": "error",
                "error": f"Path not found: {target_path}",
                "targetPath": str(target_path),
                "nodes": [],
                "edges": [],
                "violations": [],
                "cycles": [],
                "layers": [],
                "availableBlueprints": [
                    {"id": b["id"], "name": b["name"], "description": b["description"]}
                    for b in load_available_blueprints()
                ],
                "metrics": {
                    "healthScore": 0,
                    "totalModules": 0,
                    "internalModules": 0,
                    "stdlibModules": 0,
                    "externalModules": 0,
                    "totalDependencies": 0,
                    "totalViolations": 0,
                    "cyclesCount": 0,
                    "layerDistribution": {}
                }
            }

        # 1. Load Blueprint
        if custom_ruleset:
            blueprint = {"id": "custom", "name": "Custom Architecture", "ruleset": custom_ruleset}
        else:
            blueprint = get_blueprint_by_id(blueprint_id or "archon_architecture")
            if not blueprint:
                blueprints = load_available_blueprints()
                blueprint = blueprints[0] if blueprints else {"id": "default", "ruleset": {"layers": [], "rules": []}}

        ruleset = blueprint.get("ruleset", {})
        layers_def = ruleset.get("layers", [])

        # 2. Extract dependencies & build NetworkX graph
        raw_deps = extract_project_dependencies(str(scan_dir))
        G = build_dependency_graph(raw_deps)

        # 3. Detect Cycles (Tarjan's algorithm on internal nodes)
        cycles = find_cycles(G)
        cycle_nodes_set: Set[str] = set()
        cycle_edges_set: Set[tuple] = set()
        
        for c in cycles:
            for i in range(len(c)):
                cycle_nodes_set.add(c[i])
                cycle_edges_set.add((c[i], c[(i + 1) % len(c)]))

        # 4. Map modules to architectural layers
        mapping: Dict[str, str] = {}
        for node in G.nodes():
            node_type = G.nodes[node].get("node_type", "internal")
            if node_type == "stdlib":
                mapping[node] = "Stdlib"
            elif node_type == "external":
                mapping[node] = "External"
            else:
                matched = match_layer_by_patterns(node, layers_def)
                mapping[node] = matched if matched else heuristic_layer_classify(node)

        # 5. Check architecture violations
        report: ConformanceReport = check_architecture(G, mapping, ruleset)

        # Map violations by edge key: (source, target) -> violation
        violation_lookup: Dict[tuple, ArchitecturalViolation] = {
            (v.source_module, v.target_module): v for v in report.violations
        }

        # 6. Build Frontend Node Models
        nodes_out = []
        for node, data in G.nodes(data=True):
            if not node or not str(node).strip():
                continue
            node_type = data.get("node_type", "internal")
            if not include_external and node_type != "internal":
                continue

            in_deg = G.in_degree(node)
            out_deg = G.out_degree(node)
            layer = mapping.get(node, "Unclassified")
            
            # Count violations where this node is source or target
            v_count = sum(1 for v in report.violations if v.source_module == node or v.target_module == node)
            in_cycle = node in cycle_nodes_set

            color = LAYER_COLORS.get(layer, LAYER_COLORS["Unclassified"])
            
            # Label formatting
            parts = node.split(".")
            short_label = parts[-1] if len(parts) > 1 else node
            
            total_deg = in_deg + out_deg
            # Exact bl00d.money radius formula: 1.6 + Math.sqrt(deg) * 2.1
            r_calc = round(1.6 + math.sqrt(total_deg) * 2.1, 1)

            nodes_out.append({
                "id": node,
                "label": short_label,
                "fullPath": node,
                "layer": layer,
                "nodeType": node_type,
                "color": color,
                "inDegree": in_deg,
                "outDegree": out_deg,
                "totalDegree": total_deg,
                "violationsCount": v_count,
                "isCycle": in_cycle,
                "radius": r_calc
            })

        # 7. Build Frontend Edge Models
        edges_out = []
        for src, tgt, data in G.edges(data=True):
            if not src or not str(src).strip() or not tgt or not str(tgt).strip():
                continue
            src_type = G.nodes[src].get("node_type", "internal")
            tgt_type = G.nodes[tgt].get("node_type", "internal")

            if not include_external and (src_type != "internal" or tgt_type != "internal"):
                continue

            v_info = violation_lookup.get((src, tgt))
            is_v = v_info is not None
            is_c = (src, tgt) in cycle_edges_set

            edge_dict = {
                "id": f"{src}->{tgt}",
                "source": src,
                "target": tgt,
                "sourceLayer": mapping.get(src, "Unclassified"),
                "targetLayer": mapping.get(tgt, "Unclassified"),
                "lineNumber": data.get("line_number"),
                "codeSnippet": data.get("code_snippet"),
                "isViolation": is_v,
                "isCycle": is_c,
                "severity": v_info.severity if v_info else "none",
                "violation": v_info.model_dump() if v_info else None
            }
            edges_out.append(edge_dict)

        # 8. Layer distribution summary
        layer_dist: Dict[str, int] = {}
        for n in nodes_out:
            l = n["layer"]
            layer_dist[l] = layer_dist.get(l, 0) + 1

        active_layers = [
            {"name": l_name, "color": LAYER_COLORS.get(l_name, "#8b8b86"), "count": count}
            for l_name, count in sorted(layer_dist.items(), key=lambda x: -x[1])
        ]

        # 9. Format response
        return {
            "status": "success",
            "targetPath": str(scan_dir),
            "blueprint": {
                "id": blueprint.get("id"),
                "name": blueprint.get("name"),
                "description": blueprint.get("description", "")
            },
            "metrics": {
                "healthScore": round(report.score, 1),
                "totalModules": len(nodes_out),
                "internalModules": sum(1 for n in nodes_out if n["nodeType"] == "internal"),
                "stdlibModules": sum(1 for n in nodes_out if n["nodeType"] == "stdlib"),
                "externalModules": sum(1 for n in nodes_out if n["nodeType"] == "external"),
                "totalDependencies": len(edges_out),
                "totalViolations": len(report.violations),
                "cyclesCount": len(cycles),
                "layerDistribution": layer_dist
            },
            "nodes": nodes_out,
            "edges": edges_out,
            "violations": [v.model_dump() for v in report.violations],
            "cycles": cycles,
            "layers": active_layers,
            "availableBlueprints": [
                {"id": b["id"], "name": b["name"], "description": b["description"]}
                for b in load_available_blueprints()
            ]
        }
