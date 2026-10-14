"""Blueprint discovery and loading for Archon Conformance Studio."""

import json
from pathlib import Path
from typing import Dict, List, Any, Optional

_root = Path("/workspace") if Path("/workspace/shared/fixtures").exists() else Path(__file__).resolve().parent.parent.parent
FIXTURES_DIR = _root / "shared" / "fixtures"
ARCGEN_DIR = (_root / "copilot_ide" / "services" / "arcgen") if (_root / "copilot_ide").exists() else (_root / "services" / "arcgen")

def load_available_blueprints() -> List[Dict[str, Any]]:
    """Loads all standard architecture blueprints from shared fixtures and ArcGen outputs."""
    blueprints = []
    
    # 1. Standard Fixtures
    if FIXTURES_DIR.exists():
        for file in sorted(FIXTURES_DIR.glob("*.json")):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    blueprint_id = file.stem
                    blueprints.append({
                        "id": blueprint_id,
                        "name": data.get("project_name", file.stem.replace("_", " ").title()),
                        "description": f"Standard {data.get('project_name', file.stem)} specification ({len(data.get('layers', []))} layers, {len(data.get('rules', []))} rules)",
                        "layers": [layer.get("name") for layer in data.get("layers", [])],
                        "source": "shared_fixtures",
                        "ruleset": data
                    })
            except Exception:
                continue

    # 2. Check for ArcGen generated outputs
    if ARCGEN_DIR.exists():
        for file in sorted(ARCGEN_DIR.glob("*architecture*.json")):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    blueprint_id = f"arcgen_{file.stem}"
                    name = data.get("name") or data.get("project_name") or f"ArcGen {file.stem.replace('_', ' ').title()}"
                    
                    # Convert ArcGen format to Conformance ruleset if needed
                    layers = []
                    if "layers" in data and isinstance(data["layers"], list):
                        layers = [l.get("name") if isinstance(l, dict) else str(l) for l in data["layers"]]
                    elif "nodes" in data and isinstance(data["nodes"], list):
                        layers = sorted(list(set(n.get("layer", "Application") for n in data["nodes"] if n.get("layer"))))
                    
                    if not layers:
                        layers = ["Presentation", "Application", "Domain", "Infrastructure"]
                        
                    blueprints.append({
                        "id": blueprint_id,
                        "name": name,
                        "description": f"ArcGen AI Synthesized Architecture: {data.get('summary', file.name)}",
                        "layers": layers,
                        "source": "arcgen_synthesis",
                        "ruleset": data
                    })
            except Exception:
                continue

    return blueprints


def get_blueprint_by_id(blueprint_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a specific blueprint by its ID."""
    all_bp = load_available_blueprints()
    for bp in all_bp:
        if bp["id"] == blueprint_id:
            return bp
    return all_bp[0] if all_bp else None
