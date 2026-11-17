"""Ruleset sources: built-in fixtures, ArcGen architectures, imported rulesets.

Run with `python -m pytest conformance/tests` or directly: `python conformance/tests/test_rulesets.py`.
"""

import copy
import json
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from conformance.studio import blueprints as bp
from conformance.studio.arcgen_adapter import arcgen_rulesets, convert_arcgen, is_arcgen_graph
from conformance.studio.service import resolve_blueprint

# A real saved ArcGen output. If this test starts failing after an ArcGen change, the output
# format moved and conformance/studio/arcgen_adapter.py needs to follow it.
REAL_ARCGEN = ROOT / "copilot_ide" / "architecture" / "enterprise_b2b_payment_gateway_architecture.json"

GRAPH = {
    "project_name": "Shop",
    "style": "Clean Architecture",
    "nodes": [
        {"node_id": "C1", "name": "OrderController", "node_type": "module", "layer": "Presentation", "description": "HTTP entry"},
        {"node_id": "C2", "name": "PlaceOrder", "node_type": "module", "layer": "Application", "description": "Use case",
         "responsibilities": ["validate order"]},
        {"node_id": "C3", "name": "Order", "node_type": "module", "layer": "Domain", "description": "Entity"},
        {"node_id": "C4", "name": "Pricing", "node_type": "module", "layer": "Domain", "description": "Rules"},
        {"node_id": "C5", "name": "OrdersDb", "node_type": "datastore", "layer": None, "description": "Postgres"},
    ],
    "edges": [
        {"edge_id": "E1", "source": "C1", "target": "C2", "edge_type": "direct_call", "justification": "Controller runs the use case",
         "traced_requirements": ["FR-001"]},
        {"edge_id": "E2", "source": "C2", "target": "C3", "edge_type": "direct_call", "justification": "Creates the order",
         "traced_requirements": ["FR-001", "ASR-002"]},
        {"edge_id": "E3", "source": "C2", "target": "C4", "edge_type": "direct_call", "justification": "Prices the order",
         "traced_requirements": ["FR-003"]},
        {"edge_id": "E4", "source": "C3", "target": "C4", "edge_type": "direct_call", "justification": "Same tier"},
        {"edge_id": "E5", "source": "C2", "target": "C5", "edge_type": "db_write", "justification": "Persists"},
    ],
}


@contextmanager
def dirs(arcgen=None, rulesets=None):
    """Point the loader at temporary ArcGen / imported-ruleset folders."""
    old = bp.ARCGEN_DIR, bp.RULESETS_DIR
    with tempfile.TemporaryDirectory() as tmp:
        bp.ARCGEN_DIR = Path(arcgen) if arcgen else Path(tmp) / "architecture"
        bp.RULESETS_DIR = Path(rulesets) if rulesets else Path(tmp) / "rulesets"
        try:
            yield Path(tmp)
        finally:
            bp.ARCGEN_DIR, bp.RULESETS_DIR = old


def test_builtin_fixtures_are_valid():
    with dirs():
        blueprints, issues = bp.scan_blueprints()
    assert issues == []
    assert {"archon_architecture", "clean_architecture", "layered_architecture", "mvc_architecture"} <= {b["id"] for b in blueprints}


def test_layer_conversion():
    rs = convert_arcgen(GRAPH, "layer")
    assert [l["name"] for l in rs["layers"]] == ["Presentation", "Application", "Domain"]
    pairs = {(r["source_layer"], r["target_layer"]): r for r in rs["rules"]}
    assert set(pairs) == {("Presentation", "Application"), ("Application", "Domain")}  # same-tier and datastore edges drop out
    merged = pairs[("Application", "Domain")]
    assert merged["derived_from"] == ["E2", "E3"]
    assert merged["traced_requirements"] == ["FR-001", "ASR-002", "FR-003"]
    assert "Creates the order" in merged["reason"] and "Prices the order" in merged["reason"]
    assert rs["metadata"]["skipped_components"] == [{"name": "OrdersDb", "node_type": "datastore", "reason": "no source files to check"}]
    assert bp.validate_ruleset(rs) == []


def test_component_conversion():
    rs = convert_arcgen(GRAPH, "component")
    assert [l["name"] for l in rs["layers"]] == ["OrderController", "PlaceOrder", "Order", "Pricing"]
    assert rs["layers"][1]["parent_layer"] == "Application"
    assert "validate order" in rs["layers"][1]["description"]
    assert ("Order", "Pricing") in {(r["source_layer"], r["target_layer"]) for r in rs["rules"]}  # kept at this level
    assert len(rs["rules"]) == 4
    assert bp.validate_ruleset(rs) == []


def test_graph_without_tiers_defaults_to_components():
    graph = copy.deepcopy(GRAPH)
    for n in graph["nodes"]:
        n["layer"] = None
    default, component = arcgen_rulesets(graph)
    assert default["metadata"]["granularity"] == "component" and component is None


def test_arcgen_input_is_not_modified():
    before = copy.deepcopy(GRAPH)
    arcgen_rulesets(GRAPH)
    assert GRAPH == before


def test_real_arcgen_output_compiles():
    data = json.loads(REAL_ARCGEN.read_text(encoding="utf-8"))
    assert is_arcgen_graph(data)
    default, component = arcgen_rulesets(data)
    assert bp.validate_ruleset(default) == [] and bp.validate_ruleset(component) == []
    assert default["rules"] and all(r["derived_from"] for r in default["rules"])
    assert len(component["layers"]) > len(default["layers"])


def test_arcgen_folder_is_discovered():
    with dirs(arcgen=REAL_ARCGEN.parent):
        blueprints, issues = bp.scan_blueprints()
    assert issues == []
    found = [b for b in blueprints if b["source"] == "arcgen_synthesis"]
    assert [b["id"] for b in found] == ["arcgen_enterprise_b2b_payment_gateway_architecture"]
    assert found[0]["componentRuleset"] is not None


def test_broken_files_are_reported_not_hidden():
    with dirs() as tmp:
        bp.ARCGEN_DIR.mkdir()
        (bp.ARCGEN_DIR / "bad_architecture.json").write_text("{not json", encoding="utf-8")
        (bp.ARCGEN_DIR / "odd_architecture.json").write_text('{"hello": 1}', encoding="utf-8")
        _, issues = bp.scan_blueprints()
    assert {i["file"] for i in issues} == {"bad_architecture.json", "odd_architecture.json"}


def test_validation_messages():
    bad = copy.deepcopy(bp.RULESET_TEMPLATE)
    bad["rules"][0]["target_layer"] = "Nowhere"
    bad["rules"][1]["type"] = "maybe"
    bad["layers"].append(dict(bad["layers"][0]))
    del bad["layers"][1]["description"]
    errors = "\n".join(bp.validate_ruleset(bad))
    assert "rules[0].target_layer: 'Nowhere' is not one of the defined layers" in errors
    assert "rules[1].type" in errors
    assert "'Presentation' is used more than once" in errors
    assert "layers[1].description" in errors
    assert bp.validate_ruleset([]) and bp.validate_ruleset({"project_name": "x", "layers": [], "rules": []})
    assert bp.validate_ruleset(bp.RULESET_TEMPLATE) == []


def test_import_save_list_delete():
    with dirs():
        saved = bp.save_custom_ruleset(bp.RULESET_TEMPLATE, name="Team Rules!")
        assert saved["id"] == "custom_team_rules" and saved["replaced"] is False
        assert bp.save_custom_ruleset(bp.RULESET_TEMPLATE, name="Team Rules!")["replaced"] is True
        listed = bp.get_blueprint_by_id("custom_team_rules")
        assert listed["source"] == "custom" and listed["name"] == "Team Rules!"
        assert bp.delete_custom_ruleset("clean_architecture") is False
        assert bp.delete_custom_ruleset("custom_../clean_architecture") is False
        assert bp.delete_custom_ruleset("custom_team_rules") is True
        assert bp.delete_custom_ruleset("custom_team_rules") is False


def test_import_rejects_invalid_and_accepts_arcgen_graph():
    with dirs():
        try:
            bp.save_custom_ruleset({"project_name": "x", "layers": [], "rules": []})
            raise AssertionError("an empty ruleset must be rejected")
        except bp.RulesetError as e:
            assert e.errors
        assert not bp.RULESETS_DIR.exists()
        saved = bp.save_custom_ruleset(GRAPH)
        assert saved["id"] == "custom_shop" and saved["layers"] == 3


def test_custom_ruleset_is_validated_on_audit():
    assert resolve_blueprint(None, bp.RULESET_TEMPLATE)["name"] == "My Project"
    assert resolve_blueprint(None, GRAPH)["ruleset"]["metadata"]["source"] == "arcgen"
    try:
        resolve_blueprint(None, {"layers": "nope"})
        raise AssertionError("an invalid custom ruleset must be rejected")
    except bp.RulesetError:
        pass


PHASE2_ARCGEN = {
    "project_name": "Shop",
    "nodes": [
        {"node_id": "api", "name": "Shop API", "node_type": "service", "layer": "Presentation"},
        {"node_id": "orders", "name": "Order Use Case", "node_type": "service", "layer": "Application"},
        {"node_id": "rules", "name": "Pricing Rules", "node_type": "module", "layer": "Domain"},
        {"node_id": "db", "name": "Order Repository", "node_type": "module", "layer": "Infrastructure"},
    ],
    "edges": [
        {"edge_id": "E1", "source": "api", "target": "orders", "justification": "API delegates to use cases.", "traced_requirements": ["FR-1"]},
        {"edge_id": "E2", "source": "orders", "target": "rules", "justification": "Use cases apply pricing.", "traced_requirements": ["FR-2"]},
        {"edge_id": "E3", "source": "orders", "target": "db", "justification": "Use cases persist orders.", "traced_requirements": ["FR-3"]},
    ],
}


def test_audit_maps_automatically_with_coverage_and_traces():
    from conformance.studio.service import ConformanceService
    r = ConformanceService().run_audit("test_codebases/ecommerce_platform", custom_ruleset=copy.deepcopy(PHASE2_ARCGEN),
                                       include_external=False)
    assert r["status"] == "success", r.get("error")
    m = r["metrics"]
    # All modules map to layers, full coverage
    assert m["coverage"] == 100.0
    assert m["totalModules"] > 0
    # Every violation carries its relative source file and blueprint trace
    assert r["violations"] and all(v["trace"] is not None for v in r["violations"])
    assert all("source_file" in v for v in r["violations"])
    v = next(v for v in r["violations"] if v["source_layer"] == "Presentation" and v["target_layer"] == "Infrastructure")
    assert v["trace"]["route"] == ["Presentation", "Application", "Infrastructure"]
    assert [h["arcgenEdges"] for h in v["trace"]["rules"]] == [["E1"], ["E3"]]
    assert [h["requirements"] for h in v["trace"]["rules"]] == [["FR-1"], ["FR-3"]]


def test_session_persistence_and_github_slugs():
    from conformance.studio.service import heuristic_layer_classify
    from conformance.studio.github_import import github_slug
    from conformance.studio.session import load_latest_session
    # Heuristic maps domain package and fallback
    assert heuristic_layer_classify("domain") == "Domain"
    assert heuristic_layer_classify("unknown_helper") == "Application"
    # Session persistence verification
    session = load_latest_session()
    assert session is not None
    assert "metrics" in session
    # GitHub slugs
    assert github_slug("https://github.com/acme/shop.git") == "acme/shop"
    assert github_slug("github.com/acme/shop/tree/main") == "acme/shop"
    assert github_slug("gh:acme/shop") == "acme/shop"
    assert github_slug("acme/shop") is None
    assert github_slug("C:/code/shop") is None


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok    {name}")
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"FAIL  {name}: {type(exc).__name__}: {exc}")
    sys.exit(1 if failed else 0)
