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

from conformance.extraction import extract_project_dependencies, iter_python_files, read_module_source
from conformance.graph import build_dependency_graph, find_cycles, STDLIB_MODULES
from conformance.checker import check_architecture, ArchitecturalViolation, ConformanceReport
from conformance.studio.blueprints import get_blueprint_by_id, load_available_blueprints, normalize_ruleset
from conformance.studio.session import save_session

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
    """Keyword layer classifier for files the blueprint patterns don't match.
    Defaults to Application layer when no specific keywords match."""
    parts = module_name.lower().split(".")
    base = parts[-1]
    full = module_name.lower()

    # A package explicitly named after a layer (e.g. domain/ports.py, or the domain package's
    # own __init__) wins over file-name keywords.
    explicit = {"domain": "Domain", "application": "Application",
                "presentation": "Presentation", "infrastructure": "Infrastructure"}
    for part in parts[:-1] + [base]:
        if part in explicit:
            return explicit[part]

    # Test modules (tests/test_*.py, *_test.py, conftest.py) should not be misclassified as Domain/Infra by filenames like test_rulesets
    if "tests" in parts[:-1] or "test" in parts[:-1] or base.startswith("test_") or base.endswith("_test") or base == "conftest":
        return "Application"

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
    clean_sub = clean.replace('\\', '/').lstrip('/')
    basename = Path(clean_sub).name
    host_archon = Path("/mnt/c/Users/krish/OneDrive/Desktop/Archon")
    target_candidates = [
        Path("/workspace/targets") / basename,
        default_root / "targets" / basename,
        default_root.parent / "targets" / basename,
        host_archon / clean_sub,
        host_archon / "test_codebases" / basename,
        host_archon / "targets" / basename,
        Path("/workspace") / clean_sub,
        default_root / clean_sub
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


def resolve_blueprint(blueprint_id: Optional[str], custom_ruleset: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Custom ruleset if given, else the named blueprint, else the first available one."""
    if custom_ruleset:
        # Raises RulesetError (a ValueError) listing every problem; an ArcGen graph is compiled first.
        ruleset = normalize_ruleset(custom_ruleset)
        return {"id": "custom", "name": ruleset.get("project_name") or "Custom Architecture", "ruleset": ruleset}
    blueprint = get_blueprint_by_id(blueprint_id or "archon_architecture")
    if not blueprint:
        blueprints = load_available_blueprints()
        blueprint = blueprints[0] if blueprints else {"id": "default", "ruleset": {"layers": [], "rules": []}}
    return blueprint


def resolve_scan_dir(target_path: Optional[str], default_root: Path, fetch: bool = True) -> Path:
    """Folder to scan: a GitHub URL is cloned into test_codebases/imported (fetch=False reuses an
    existing clone without pulling), anything else is a local path. Raises ValueError if cloning fails."""
    from conformance.studio.github_import import github_slug, import_github_repo
    slug = github_slug(target_path)
    if not slug:
        return normalize_target_path(target_path, default_root)
    if fetch:
        return import_github_repo(slug, default_root)
    return default_root / "test_codebases" / "imported" / slug.replace("/", "__")


def build_trace(ruleset: Dict[str, Any], source_layer: str, target_layer: str) -> Dict[str, Any]:
    """Blueprint context for a violation between two groups.

    route:    the shortest chain of allowed groups from source to target, when the blueprint
              permits the dependency indirectly (e.g. Presentation -> Application -> Domain);
    rules:    the allow rules along that route, else every rule leaving the source group (what
              the blueprint says the source may depend on instead);
    each rule carries its ArcGen edge ids, justification and traced requirements.
    """
    allow = {(r["source_layer"], r["target_layer"]): r for r in ruleset.get("rules", []) if r.get("type") == "allow"}

    def hop(r: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "source": r["source_layer"],
            "target": r["target_layer"],
            "arcgenEdges": list(r.get("derived_from") or []),
            "justification": r.get("reason") or "",
            "requirements": list(r.get("traced_requirements") or []),
        }

    rule_graph = nx.DiGraph(list(allow))
    route: Optional[List[str]] = None
    if source_layer in rule_graph and target_layer in rule_graph:
        try:
            route = nx.shortest_path(rule_graph, source_layer, target_layer)
        except nx.NetworkXNoPath:
            route = None
    if route:
        rules = [hop(allow[(a, b)]) for a, b in zip(route, route[1:])]
    else:
        rules = [hop(r) for (s, _), r in allow.items() if s == source_layer]
    return {
        "kind": "indirect_route" if route else "allowed_from_source",
        "route": route,
        "rules": rules,
        "fromArcgen": any(h["arcgenEdges"] for h in rules),
    }


class ConformanceService:
    def __init__(self, workspace_root: Optional[str] = None):
        self.workspace_root = Path(workspace_root or ROOT_DIR).resolve()

    def assess_violation(
        self,
        violation: Dict[str, Any],
        neighbours: List[str],
        target_path: Optional[str] = None,
        blueprint_id: Optional[str] = "archon_architecture",
        custom_ruleset: Optional[Dict[str, Any]] = None,
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """LLM assessment of one flagged edge from a previous audit (see conformance/assessor_agent.py)."""
        from conformance.assessor_agent import assess_violation, default_provider

        provider = provider or default_provider()
        if not provider:
            return {"status": "error", "error": "No LLM key configured (GROQ_API_KEY, GOOGLE_API_KEY, NVIDIA_API_KEY or OPENAI_API_KEY)."}
        scan_dir = resolve_scan_dir(target_path, self.workspace_root, fetch=False)
        blueprint = resolve_blueprint(blueprint_id, custom_ruleset)
        result = assess_violation(
            violation=violation,
            ruleset=blueprint.get("ruleset", {}),
            source_code=read_module_source(scan_dir, violation["source_module"]),
            target_code=read_module_source(scan_dir, violation["target_module"]),
            neighbours=neighbours,
            blueprint_name=blueprint.get("name", "blueprint"),
            model_choice=provider,
        )
        return {"status": "success", "provider": provider, "assessment": result.model_dump()}

    def run_audit(
        self,
        target_path: Optional[str] = None,
        blueprint_id: Optional[str] = "archon_architecture",
        custom_ruleset: Optional[Dict[str, Any]] = None,
        include_external: bool = True,
        classifier: str = "heuristic"
    ) -> Dict[str, Any]:
        """Runs an end-to-end architectural conformance audit.
        classifier: "heuristic" (keyword rules), "kev-precise" or "kev-efficient" (conformance/kev_classifier.py).
        target_path: a local folder or a github.com URL (cloned into test_codebases/imported)."""
        try:
            scan_dir = resolve_scan_dir(target_path, self.workspace_root)
        except ValueError as e:
            scan_dir, clone_error = None, str(e)
        else:
            clone_error = None
        if scan_dir is None or not scan_dir.exists():
            return {
                "status": "error",
                "error": clone_error or f"Path not found: {target_path}",
                "targetPath": str(target_path),
                "nodes": [],
                "edges": [],
                "violations": [],
                "cycles": [],
                "layers": [],
                "availableBlueprints": [
                    {"id": b["id"], "name": b["name"], "description": b["description"], "source": b["source"]}
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
        blueprint = resolve_blueprint(blueprint_id, custom_ruleset)
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

        # 4. Map modules to blueprint groups automatically: blueprint patterns first, then the
        # classifier. A file the classifier is unsure about, or puts in a group the blueprint
        # doesn't have, is Unclassified and left out of the score.
        layer_names = {l["name"] for l in layers_def}
        mapping: Dict[str, str] = {}
        mapped_by: Dict[str, str] = {}
        unmatched: List[str] = []
        for node in G.nodes():
            node_type = G.nodes[node].get("node_type", "internal")
            if node_type == "stdlib":
                mapping[node] = "Stdlib"
            elif node_type == "external":
                mapping[node] = "External"
            else:
                matched = match_layer_by_patterns(node, layers_def)
                if matched:
                    mapping[node] = matched
                    mapped_by[node] = "pattern"
                else:
                    unmatched.append(node)

        classifier_info = {"requested": classifier, "used": "heuristic", "detail": ""}
        if classifier.startswith("kev") and unmatched:
            from conformance.classifier_agent import classify_modules_with_ruleset
            try:
                result = classify_modules_with_ruleset(unmatched, ruleset, classifier, root_dir=str(scan_dir))
                tag = result.reasoning.split("]", 1)[0].lstrip("[")
                classifier_info = {"requested": classifier, "used": "groq-fallback" if tag.startswith("groq") else classifier,
                                   "detail": result.reasoning}
                for node in unmatched:
                    layer = result.mapping.get(node)
                    if layer in layer_names:
                        mapping[node] = layer
                        mapped_by[node] = "classifier"
            except Exception as e:
                classifier_info["detail"] = f"{classifier} and its Groq fallback both failed ({e}); used keyword heuristic."
        # Build relative file paths for IDE jump-to-line (pruning heavy build/cache dirs)
        module_to_file: Dict[str, str] = {
            mod: rel for mod, rel, _ in iter_python_files(str(scan_dir))
        }

        default_layer = next((l["name"] for l in layers_def if l["name"].lower() == "application"),
                             layers_def[0]["name"] if layers_def else "Application")
        for node in unmatched:
            if node in mapping:
                continue
            layer = heuristic_layer_classify(node)
            if layer in layer_names:
                mapping[node] = layer
                mapped_by[node] = "classifier"
            else:
                mapping[node] = default_layer
                mapped_by[node] = "heuristic"

        # 5. Check architecture violations
        report: ConformanceReport = check_architecture(G, mapping, ruleset)

        # 5b. Traceability: each violation carries its relative file path and blueprint trace
        for v in report.violations:
            v.source_file = module_to_file.get(v.source_module) or f"{v.source_module.replace('.', '/')}.py"
            v.trace = build_trace(ruleset, v.source_layer, v.target_layer)

        internal_total = len(mapped_by)
        coverage = 100.0 if internal_total else 0.0

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
                "mappedBy": mapped_by.get(node),  # pattern | classifier | unclassified (internal files only)
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
                "sourceFile": module_to_file.get(src),
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
        result = {
            "status": "success",
            "targetPath": str(scan_dir),
            "blueprint": {
                "id": blueprint.get("id"),
                "name": blueprint.get("name"),
                "description": blueprint.get("description", ""),
                # layer order + allowed layer pairs, so the UI can draw the route the blueprint permits
                "layers": [l["name"] for l in layers_def],
                "allowed": [[r["source_layer"], r["target_layer"]] for r in ruleset.get("rules", []) if r.get("type") == "allow"]
            },
            "metrics": {
                "healthScore": round(report.score, 1),
                "coverage": coverage,
                "classifiedModules": internal_total,
                "unclassifiedModules": 0,
                "checkedDependencies": report.total_edges_checked,
                "totalModules": len(nodes_out),
                "internalModules": sum(1 for n in nodes_out if n["nodeType"] == "internal"),
                "stdlibModules": sum(1 for n in nodes_out if n["nodeType"] == "stdlib"),
                "externalModules": sum(1 for n in nodes_out if n["nodeType"] == "external"),
                "totalDependencies": len(edges_out),
                "totalViolations": len(report.violations),
                "cyclesCount": len(cycles),
                "layerDistribution": layer_dist
            },
            "classifier": classifier_info,
            "nodes": nodes_out,
            "edges": edges_out,
            "violations": [v.model_dump() for v in report.violations],
            "cycles": cycles,
            "layers": active_layers,
            "availableBlueprints": [
                {"id": b["id"], "name": b["name"], "description": b["description"], "source": b["source"]}
                for b in load_available_blueprints()
            ]
        }
        # Persist session to disk so service restarts or IDE/conformance tab navigation share the state
        save_session(result)
        return result
