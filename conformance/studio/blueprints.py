"""Blueprint discovery, validation and storage for Archon Conformance Studio.

Three sources, all checked against shared.schema.ArchitectureRuleset before they reach the checker:
  1. built-in fixtures        shared/fixtures/*.json
  2. ArcGen architectures     <workspace>/architecture/*architecture*.json  (compiled, never modified)
  3. imported rulesets        <workspace>/rulesets/*.json
"""

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError

from conformance.studio.arcgen_adapter import arcgen_rulesets, is_arcgen_graph
from shared.schema import ArchitectureRuleset

_root = Path("/workspace") if Path("/workspace/shared/fixtures").exists() else Path(__file__).resolve().parent.parent.parent
FIXTURES_DIR = _root / "shared" / "fixtures"
# In Docker /workspace is copilot_ide itself; on the host it is a folder of the repo root.
_workspace = _root if _root == Path("/workspace") else ((_root / "copilot_ide") if (_root / "copilot_ide" / "services").exists() else _root)
# Where ArcGen's save-to-workspace writes (arcgen_service/app/router.py: WORKSPACE_ROOT / "architecture").
ARCGEN_DIR = Path(os.getenv("ARCHON_ARCHITECTURE_DIR") or (_workspace / "architecture"))
RULESETS_DIR = Path(os.getenv("ARCHON_RULESETS_DIR") or (_workspace / "rulesets"))

CUSTOM_PREFIX = "custom_"
ARCGEN_PREFIX = "arcgen_"

RULESET_TEMPLATE: Dict[str, Any] = {
    "version": "1.0",
    "project_name": "My Project",
    "default_policy": "default-deny",
    "unclassified_policy": "flag_for_review",
    "layers": [
        {
            "name": "Presentation",
            "description": "HTTP routes, controllers and UI code. Translates requests into use-case calls.",
            "match_patterns": ["*.api.*", "*.routes.*"],
        },
        {
            "name": "Application",
            "description": "Use cases and services that orchestrate the domain.",
            "match_patterns": ["*.services.*"],
        },
        {
            "name": "Domain",
            "description": "Core business entities and rules. Knows nothing about frameworks or storage.",
            "match_patterns": ["*.domain.*", "*.models.*"],
        },
        {
            "name": "Infrastructure",
            "description": "Databases, external API clients and other adapters.",
            "match_patterns": ["*.db.*", "*.repositories.*"],
        },
    ],
    "rules": [
        {"source_layer": "Presentation", "target_layer": "Application", "type": "allow",
         "reason": "Controllers call use cases.", "severity": "major"},
        {"source_layer": "Application", "target_layer": "Domain", "type": "allow",
         "reason": "Use cases orchestrate domain entities.", "severity": "major"},
        {"source_layer": "Infrastructure", "target_layer": "Domain", "type": "allow",
         "reason": "Adapters implement domain interfaces.", "severity": "major"},
    ],
}


class RulesetError(ValueError):
    """A ruleset that does not satisfy the schema; .errors lists every problem in plain words."""

    def __init__(self, errors: List[str]):
        self.errors = errors
        super().__init__("Invalid ruleset: " + "; ".join(errors))


def _loc(parts: Tuple[Any, ...]) -> str:
    out = ""
    for p in parts:
        out += f"[{p}]" if isinstance(p, int) else (f".{p}" if out else str(p))
    return out


def validate_ruleset(data: Any) -> List[str]:
    """Every problem with a ruleset, as readable messages. An empty list means it is valid."""
    if not isinstance(data, dict):
        return ["The ruleset must be a JSON object with 'project_name', 'layers' and 'rules'."]
    errors: List[str] = []

    layers = data.get("layers")
    names = [l.get("name") for l in layers if isinstance(l, dict)] if isinstance(layers, list) else []
    if isinstance(layers, list) and not layers:
        errors.append("layers: define at least one layer.")
    for name in sorted({n for n in names if isinstance(n, str) and names.count(n) > 1}):
        errors.append(f"layers: the name '{name}' is used more than once.")

    # Report every rule that points at a missing layer (the schema itself stops at the first).
    known = {n for n in names if isinstance(n, str)}
    rules = data.get("rules")
    if isinstance(rules, list):
        for i, rule in enumerate(rules):
            if not isinstance(rule, dict):
                continue
            for field in ("source_layer", "target_layer"):
                value = rule.get(field)
                if isinstance(value, str) and value not in known:
                    errors.append(f"rules[{i}].{field}: '{value}' is not one of the defined layers "
                                  f"({', '.join(sorted(known)) or 'none defined'}).")

    try:
        ArchitectureRuleset.model_validate(data)
    except ValidationError as exc:
        for err in exc.errors():
            if not err["loc"]:
                continue  # the undefined-layer check above already reported this in full
            message = err["msg"].removeprefix("Value error, ")
            errors.append(f"{_loc(err['loc'])}: {message}")
    return errors


def normalize_ruleset(data: Any) -> Dict[str, Any]:
    """A valid ruleset dict from user input: an ArcGen graph is compiled first. Raises RulesetError."""
    if is_arcgen_graph(data):
        data = arcgen_rulesets(data)[0]
    errors = validate_ruleset(data)
    if errors:
        raise RulesetError(errors)
    return data


def _read_json(file: Path) -> Any:
    with open(file, "r", encoding="utf-8") as f:
        return json.load(f)


def _summary(ruleset: Dict[str, Any]) -> str:
    return f"{len(ruleset['layers'])} layers, {len(ruleset['rules'])} rules"


def scan_blueprints() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """(usable blueprints, files that were skipped and why)."""
    blueprints: List[Dict[str, Any]] = []
    issues: List[Dict[str, Any]] = []

    def skip(file: Path, source: str, errors: List[str]) -> None:
        issues.append({"file": file.name, "source": source, "errors": errors})

    def load(file: Path, source: str) -> Any:
        try:
            return _read_json(file)
        except (OSError, ValueError) as exc:
            skip(file, source, [f"Could not read the file as JSON: {exc}"])
            return None

    # 1. Built-in fixtures
    if FIXTURES_DIR.exists():
        for file in sorted(FIXTURES_DIR.glob("*.json")):
            data = load(file, "shared_fixtures")
            if data is None:
                continue
            errors = validate_ruleset(data)
            if errors:
                skip(file, "shared_fixtures", errors)
                continue
            blueprints.append({
                "id": file.stem,
                "name": data["project_name"],
                "description": f"Standard {data['project_name']} specification ({_summary(data)})",
                "layers": [layer["name"] for layer in data["layers"]],
                "source": "shared_fixtures",
                "ruleset": data,
            })

    # 2. ArcGen architectures, compiled to a ruleset on load
    if ARCGEN_DIR.exists():
        for file in sorted(ARCGEN_DIR.glob("*architecture*.json")):
            data = load(file, "arcgen_synthesis")
            if data is None:
                continue
            if not is_arcgen_graph(data):
                skip(file, "arcgen_synthesis", ["Not an ArcGen architecture: expected 'nodes' and 'edges'."])
                continue
            try:
                ruleset, component_ruleset = arcgen_rulesets(data)
            except Exception as exc:
                skip(file, "arcgen_synthesis", [f"Could not compile the architecture into rules: {exc}"])
                continue
            errors = validate_ruleset(ruleset)
            if errors:
                skip(file, "arcgen_synthesis", errors)
                continue
            if component_ruleset is not None and validate_ruleset(component_ruleset):
                component_ruleset = None
            meta = ruleset["metadata"]
            blueprints.append({
                "id": f"{ARCGEN_PREFIX}{file.stem}",
                "name": f"ArcGen: {ruleset['project_name']}",
                "description": (f"Generated by ArcGen ({meta.get('style') or 'unknown style'}): {_summary(ruleset)} "
                                f"compiled from {meta['components']} components"),
                "layers": [layer["name"] for layer in ruleset["layers"]],
                "source": "arcgen_synthesis",
                "sourceFile": file.name,
                "ruleset": ruleset,
                "componentRuleset": component_ruleset,
            })

    # 3. Imported rulesets
    if RULESETS_DIR.exists():
        for file in sorted(RULESETS_DIR.glob("*.json")):
            data = load(file, "custom")
            if data is None:
                continue
            errors = validate_ruleset(data)
            if errors:
                skip(file, "custom", errors)
                continue
            blueprints.append({
                "id": f"{CUSTOM_PREFIX}{file.stem}",
                "name": data["project_name"],
                "description": f"Imported ruleset ({_summary(data)})",
                "layers": [layer["name"] for layer in data["layers"]],
                "source": "custom",
                "ruleset": data,
            })

    return blueprints, issues


def load_available_blueprints() -> List[Dict[str, Any]]:
    """All usable blueprints: built-in, ArcGen-generated and imported."""
    return scan_blueprints()[0]


def get_blueprint_by_id(blueprint_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a specific blueprint by its ID."""
    all_bp = load_available_blueprints()
    for bp in all_bp:
        if bp["id"] == blueprint_id:
            return bp
    return all_bp[0] if all_bp else None


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower())[:60].strip("_") or "ruleset"


def save_custom_ruleset(data: Any, name: Optional[str] = None) -> Dict[str, Any]:
    """Validates and stores an imported ruleset as a file. Raises RulesetError if it is invalid."""
    ruleset = dict(normalize_ruleset(data))
    if name and name.strip():
        ruleset["project_name"] = name.strip()
    slug = _slug(ruleset["project_name"])
    RULESETS_DIR.mkdir(parents=True, exist_ok=True)
    target = RULESETS_DIR / f"{slug}.json"
    replaced = target.exists()
    with open(target, "w", encoding="utf-8") as f:
        json.dump(ruleset, f, indent=2)
    return {"id": f"{CUSTOM_PREFIX}{slug}", "name": ruleset["project_name"], "replaced": replaced,
            "layers": len(ruleset["layers"]), "rules": len(ruleset["rules"])}


def delete_custom_ruleset(blueprint_id: str) -> bool:
    """Removes an imported ruleset. Built-in and ArcGen blueprints cannot be deleted here."""
    if not blueprint_id.startswith(CUSTOM_PREFIX):
        return False
    slug = blueprint_id[len(CUSTOM_PREFIX):]
    if slug != _slug(slug):
        return False
    target = RULESETS_DIR / f"{slug}.json"
    if not target.is_file():
        return False
    target.unlink()
    return True
