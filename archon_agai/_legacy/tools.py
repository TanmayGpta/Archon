import os
import sys
import json
from typing import Dict, Any, List

# Ensure repository root is in sys.path
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from conformance.extraction import extract_project_dependencies
from conformance.graph import build_dependency_graph, find_cycles
from conformance.checker import check_architecture

def scan_and_check_conformance(codebase_dir: str, ruleset_path: str = "") -> dict:
    """
    Performs static AST analysis on a codebase directory, constructs the module
    dependency graph, maps modules to architectural layers (Domain, Application,
    Presentation, Infrastructure), and evaluates the architecture against specified rules.

    Args:
        codebase_dir: Relative or absolute path to the target codebase (e.g. 'test_codebases/ecommerce_platform').
        ruleset_path: Optional path to the clean architecture ruleset JSON. Defaults to 'shared/fixtures/clean_architecture.json'.

    Returns:
        dict: Conformance metrics, overall architectural health score, total edges checked,
              and detailed list of violations with severity, code snippet, XAI explanation, and remediation.
    """
    if not os.path.isabs(codebase_dir):
        codebase_dir = os.path.join(REPO_ROOT, codebase_dir)

    if not ruleset_path:
        ruleset_path = os.path.join(REPO_ROOT, "shared", "fixtures", "clean_architecture.json")
    elif not os.path.isabs(ruleset_path):
        ruleset_path = os.path.join(REPO_ROOT, ruleset_path)

    if not os.path.exists(codebase_dir):
        return {"error": f"Codebase directory not found: {codebase_dir}"}
    if not os.path.exists(ruleset_path):
        return {"error": f"Ruleset JSON file not found: {ruleset_path}"}

    with open(ruleset_path, "r", encoding="utf-8") as rf:
        ruleset = json.load(rf)

    # 1. Extract AST imports and dependencies
    deps = extract_project_dependencies(codebase_dir)

    # 2. Build dependency graph
    graph = build_dependency_graph(deps)

    # 3. Derive semantic layer mapping based on module namespace
    layer_mapping: Dict[str, str] = {}
    for mod in deps.keys():
        root_pkg = mod.split(".")[0].lower()
        if "domain" in root_pkg:
            layer_mapping[mod] = "Domain"
        elif "application" in root_pkg:
            layer_mapping[mod] = "Application"
        elif "presentation" in root_pkg:
            layer_mapping[mod] = "Presentation"
        elif "infrastructure" in root_pkg:
            layer_mapping[mod] = "Infrastructure"
        else:
            layer_mapping[mod] = "unclassified"

    # 4. Evaluate architecture rules
    report = check_architecture(graph, layer_mapping, ruleset)

    violations_data = []
    for v in report.violations:
        violations_data.append({
            "source_module": v.source_module,
            "target_module": v.target_module,
            "source_layer": v.source_layer,
            "target_layer": v.target_layer,
            "severity": v.severity,
            "reason": v.reason,
            "line_number": v.line_number,
            "code_snippet": v.code_snippet,
            "explanation": v.explanation,
            "remediation": v.remediation
        })

    return {
        "status": "success",
        "codebase": os.path.relpath(codebase_dir, REPO_ROOT),
        "health_score": round(report.score, 2),
        "total_edges_checked": report.total_edges_checked,
        "total_violations": len(report.violations),
        "violations": violations_data
    }

def detect_circular_dependencies(codebase_dir: str) -> dict:
    """
    Detects circular dependency cycles across modules in the codebase using Tarjan's algorithm.

    Args:
        codebase_dir: Relative or absolute path to the target codebase.

    Returns:
        dict: Total cycle count and list of cyclic dependency paths.
    """
    if not os.path.isabs(codebase_dir):
        codebase_dir = os.path.join(REPO_ROOT, codebase_dir)

    if not os.path.exists(codebase_dir):
        return {"error": f"Codebase directory not found: {codebase_dir}"}

    deps = extract_project_dependencies(codebase_dir)
    graph = build_dependency_graph(deps)
    cycles = find_cycles(graph)

    return {
        "status": "success",
        "total_cycles": len(cycles),
        "cycles": cycles
    }

def inspect_module_source(file_path: str, max_lines: int = 100) -> str:
    """
    Reads the source code of a specific file within the target codebase to inspect
    import statements or implementation details.

    Args:
        file_path: Relative or absolute path to the file.
        max_lines: Maximum number of lines to read (default: 100).

    Returns:
        str: Source code snippet or error message.
    """
    if not os.path.isabs(file_path):
        file_path = os.path.join(REPO_ROOT, file_path)

    if not os.path.exists(file_path):
        return f"File not found: {file_path}"

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = [f"{i+1:3d}: {line}" for i, line in enumerate(f.readlines()[:max_lines])]
        return "".join(lines)
    except Exception as e:
        return f"Error reading file: {str(e)}"
