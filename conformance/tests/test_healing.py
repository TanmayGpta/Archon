"""Offline unit and LangGraph workflow tests for Phase 4 healing (no LLM key needed)."""
import asyncio
import json
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from conformance.healing.agent import build_healing_graph  # noqa: E402
from conformance.healing.guardrails import check_patch_file, resolve_safe_subpath  # noqa: E402
from conformance.healing.jobs import follow_heal_job, resolve_heal_job, start_heal_job  # noqa: E402
from conformance.healing.sandbox import filter_eligible_violations, verify_in_sandbox  # noqa: E402
from conformance.healing.schemas import (  # noqa: E402
    FilePatch,
    HealingPlan,
    HealJobRequest,
    PatchSet,
    PortDesign,
    SearchReplace,
)
from conformance.studio.service import ConformanceService, resolve_scan_dir  # noqa: E402

ECOMMERCE = resolve_scan_dir("ecommerce_platform", ROOT, fetch=False)


def _clean_dip_patches() -> PatchSet:
    return PatchSet(
        patches=[
            FilePatch(
                path="domain/ports.py",
                operation="create",
                content=(
                    "from typing import Protocol\n\n\n"
                    "class ErrorPresenter(Protocol):\n"
                    "    def format_error(self, message: str): ...\n"
                ),
                violation_ids=["domain.payment_rule->presentation.controllers"],
                rationale="Add ErrorPresenter port in Domain layer",
            ),
            FilePatch(
                path="domain/payment_rule.py",
                operation="modify",
                edits=[
                    SearchReplace(
                        search="from presentation.controllers import ResponseFormatter  # VIOLATION: Domain -> Presentation\n",
                        replace="from domain.ports import ErrorPresenter\n",
                    ),
                    SearchReplace(
                        search="class PaymentRuleValidator:\n",
                        replace=(
                            "class PaymentRuleValidator:\n"
                            "    def __init__(self, presenter: ErrorPresenter = None):\n"
                            "        self.presenter = presenter\n\n"
                        ),
                    ),
                    SearchReplace(
                        search="ResponseFormatter.format_error(",
                        replace="self.presenter.format_error(",
                    ),
                ],
                violation_ids=["domain.payment_rule->presentation.controllers"],
                rationale="Depend on ErrorPresenter port via constructor injection",
            ),
        ]
    )


class TestHealingCore(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = ConformanceService(str(ROOT)).run_audit(
            target_path=str(ECOMMERCE),
            blueprint_id="clean_architecture",
            persist_session=False,
        )

    def test_guardrails_block_protected_and_traversal(self):
        self.assertTrue(check_patch_file("tests/test_x.py", "x = 1\n", "x = 2\n"))
        self.assertTrue(check_patch_file("rules.json", None, "{}\n"))
        self.assertTrue(check_patch_file("../escape.py", None, "x = 1\n"))
        with self.assertRaises(ValueError):
            resolve_safe_subpath(ECOMMERCE, "../../.env")

    def test_deleting_import_without_dip_is_rejected(self):
        cheating = FilePatch(
            path="domain/payment_rule.py",
            edits=[
                SearchReplace(
                    search="from presentation.controllers import ResponseFormatter  # VIOLATION: Domain -> Presentation\n",
                    replace="",
                )
            ],
        )
        ver = verify_in_sandbox(
            ECOMMERCE,
            "clean_architecture",
            [cheating],
            self.baseline,
            target_violation_ids=["domain.payment_rule->presentation.controllers"],
        )
        self.assertFalse(ver.passed)
        self.assertTrue(ver.guardrail_rejections)

    def test_valid_dip_fix_passes_sandbox_without_mutating_real_repo(self):
        original = (ECOMMERCE / "domain" / "payment_rule.py").read_text(encoding="utf-8")
        patches = _clean_dip_patches().patches
        ver = verify_in_sandbox(
            ECOMMERCE,
            "clean_architecture",
            patches,
            self.baseline,
            target_violation_ids=["domain.payment_rule->presentation.controllers"],
        )
        self.assertTrue(ver.passed, (ver.guardrail_rejections, ver.syntax_errors, ver.new_violation_ids, ver.test_output))
        self.assertIn("domain.payment_rule->presentation.controllers", ver.resolved_violation_ids)
        self.assertGreater(ver.health_after, ver.health_before)
        self.assertEqual((ECOMMERCE / "domain" / "payment_rule.py").read_text(encoding="utf-8"), original)
        self.assertFalse((ECOMMERCE / "domain" / "ports.py").exists())

    def test_langgraph_retries_then_pauses_before_finalize(self):
        attempts_seen = []

        def fake_plan(_state):
            return HealingPlan(
                ports=[
                    PortDesign(
                        port_name="ErrorPresenter",
                        port_module="domain/ports.py",
                        adapter_module="presentation/controllers.py",
                        methods=["format_error"],
                        resolves=["domain.payment_rule->presentation.controllers"],
                    )
                ],
                notes="Invert dependency via ErrorPresenter protocol",
            )

        def fake_patch(state):
            att = state["attempt"]
            attempts_seen.append(att)
            if att == 1:
                # Bad attempt (import deletion) triggers deterministic retry with feedback.
                return PatchSet(
                    patches=[
                        FilePatch(
                            path="domain/payment_rule.py",
                            edits=[
                                SearchReplace(
                                    search="from presentation.controllers import ResponseFormatter  # VIOLATION: Domain -> Presentation\n",
                                    replace="",
                                )
                            ],
                        )
                    ]
                )
            self.assertIn("Guardrail rejections", state["feedback"])
            return _clean_dip_patches()

        eligible, _ = filter_eligible_violations(
            ECOMMERCE, self.baseline, mode="single", target_violation_id="domain.payment_rule->presentation.controllers"
        )
        graph = build_healing_graph(plan_fn=fake_plan, patch_fn=fake_patch)
        config = {"configurable": {"thread_id": "test_retry_pause"}}
        init = {
            "codebase_dir": str(ECOMMERCE),
            "blueprint_id": "clean_architecture",
            "blueprint_name": "Standard Clean Architecture",
            "ruleset": {},
            "baseline_audit": self.baseline,
            "target_violations": eligible,
            "skipped_violations": [],
            "attempt": 0,
            "max_attempts": 3,
            "started_at": time.monotonic(),
            "time_budget_s": 60.0,
        }
        for _ in graph.stream(init, config, stream_mode="updates"):
            pass

        paused = graph.get_state(config)
        # Graph must pause right before `finalize` without touching ecommerce_platform on disk.
        self.assertEqual(paused.next, ("finalize",))
        self.assertEqual(attempts_seen, [1, 2])
        self.assertEqual(paused.values["status"], "healed")
        self.assertEqual(len(paused.values["previews"]), 2)
        self.assertFalse((ECOMMERCE / "domain" / "ports.py").exists())

        graph.update_state(config, {"decision": "rejected"})
        done = graph.invoke(None, config)
        self.assertEqual(done["decision"], "rejected")

    def test_heal_job_streams_sse_and_resolves(self):
        job = start_heal_job(
            HealJobRequest(
                codebase_path=str(ECOMMERCE),
                blueprint_id="clean_architecture",
                mode="single",
                violation_id="domain.payment_rule->presentation.controllers",
            ),
            plan_fn=lambda _s: HealingPlan(ports=[], notes="DIP"),
            patch_fn=lambda _s: _clean_dip_patches(),
        )

        async def collect():
            out = []
            async for chunk in follow_heal_job(job, start=0):
                out.append(json.loads(chunk.removeprefix("data: ").strip()))
            return out

        events = asyncio.run(collect())
        types = [e["type"] for e in events]
        self.assertIn("awaiting_approval", types)
        self.assertEqual(events[-1]["type"], "complete")
        self.assertEqual(job.status, "awaiting_approval")

        res = resolve_heal_job(job.id, approved=True, applied_files=["domain/ports.py", "domain/payment_rule.py"])
        self.assertEqual(res["decision"], "approved")
        self.assertEqual(job.status, "approved")

    def test_partial_fallback_when_budget_exhausted(self):
        eligible, _ = filter_eligible_violations(
            ECOMMERCE, self.baseline, mode="single", target_violation_id="domain.payment_rule->presentation.controllers"
        )
        # Require healing both payment_rule and fraud_checker; attempt 1 only heals payment_rule cleanly, attempt 2 fails syntax.
        targets = eligible + [
            v for v in self.baseline["violations"]
            if v["source_module"] == "domain.fraud_checker"
        ]
        targets = [{**v, "id": f"{v['source_module']}->{v['target_module']}"} for v in targets]

        def fake_patch(state):
            if state["attempt"] == 1:
                return _clean_dip_patches()
            return PatchSet(patches=[FilePatch(path="domain/fraud_checker.py", edits=[SearchReplace(search="import requests\n", replace="def broken(:\n")])])

        graph = build_healing_graph(plan_fn=lambda _s: HealingPlan(ports=[], notes="DIP"), patch_fn=fake_patch)
        config = {"configurable": {"thread_id": "test_partial_fallback"}}
        init = {
            "codebase_dir": str(ECOMMERCE),
            "blueprint_id": "clean_architecture",
            "blueprint_name": "Standard Clean Architecture",
            "ruleset": {},
            "baseline_audit": self.baseline,
            "target_violations": targets,
            "skipped_violations": [],
            "attempt": 0,
            "max_attempts": 2,
            "started_at": time.monotonic(),
            "time_budget_s": 60.0,
        }
        for _ in graph.stream(init, config, stream_mode="updates"):
            pass

        paused = graph.get_state(config)
        self.assertEqual(paused.values["status"], "partial")
        self.assertEqual(len(paused.values["previews"]), 2)
        self.assertIn("domain.payment_rule->presentation.controllers", paused.values["verification"]["resolved_violation_ids"])

    def test_eligibility_skips_external_targets(self):
        fake_audit = {
            "nodes": [
                {"id": "app.svc", "nodeType": "internal", "mappedBy": "pattern"},
                {"id": "requests", "nodeType": "external"},
            ],
            "edges": [],
            "violations": [
                {
                    "source_module": "app.svc",
                    "target_module": "requests",
                    "source_layer": "Domain",
                    "target_layer": "External",
                    "reason": "No rule",
                }
            ],
        }
        eligible, skipped = filter_eligible_violations(ECOMMERCE, fake_audit, mode="all")
        self.assertEqual(eligible, [])
        self.assertEqual(skipped[0]["reason"], "target is external (not internal codebase)")

    def test_freellmapi_url_normalization(self):
        from conformance.classifier_agent import normalize_freellmapi_url

        remote = normalize_freellmapi_url("https://my-gateway.example/v1/chat/completions")
        self.assertEqual(remote, "https://my-gateway.example/v1")
        bare = normalize_freellmapi_url("https://my-gateway.example")
        self.assertEqual(bare, "https://my-gateway.example/v1")

    def test_healing_graph_fails_over_past_auth_error(self):
        from unittest.mock import patch

        class DeadAuthModel:
            def with_structured_output(self, _schema):
                raise RuntimeError("Error code: 401 - {'error': {'code': 'invalid_api_key'}}")

        class GoodModel:
            def __init__(self, target_fn):
                self._target_fn = target_fn

            def with_structured_output(self, schema):
                class _Runner:
                    def __init__(self, s, fn):
                        self.s = s
                        self.fn = fn

                    def invoke(self, _msgs):
                        if self.s is HealingPlan:
                            return HealingPlan(ports=[], notes="DIP via failover")
                        return self.fn()

                return _Runner(schema, self._target_fn)

        eligible, _ = filter_eligible_violations(
            ECOMMERCE, self.baseline, mode="single", target_violation_id="domain.payment_rule->presentation.controllers"
        )
        events = []
        with patch(
            "conformance.healing.agent.resolve_candidate_models",
            return_value=[("groq", DeadAuthModel()), ("freellmapi:auto", GoodModel(_clean_dip_patches))],
        ):
            graph = build_healing_graph(emit_fn=lambda k, m, d=None: events.append((k, m)))
            config = {"configurable": {"thread_id": "test_failover"}}
            init = {
                "codebase_dir": str(ECOMMERCE),
                "blueprint_id": "clean_architecture",
                "blueprint_name": "Standard Clean Architecture",
                "ruleset": {},
                "baseline_audit": self.baseline,
                "target_violations": eligible,
                "skipped_violations": [],
                "attempt": 0,
                "max_attempts": 1,
                "started_at": time.monotonic(),
                "time_budget_s": 60.0,
            }
            for _ in graph.stream(init, config, stream_mode="updates"):
                pass

        paused = graph.get_state(config)
        self.assertEqual(paused.values["status"], "healed")
        self.assertTrue(any("falling back to 'freellmapi:auto'" in msg for _, msg in events))

    def test_model_override_prioritizes_picker_choice_and_emits_trace_metadata(self):
        from unittest.mock import patch
        from conformance.healing.agent import resolve_candidate_models

        with patch("conformance.healing.agent.load_ide_keys", return_value={"freellmapi": "freellmapi-test"}), \
             patch("conformance.healing.agent._probe_ollama_model", return_value=None):
            cands = resolve_candidate_models(model_override="freellmapi:auto:fast")
        self.assertTrue(cands[0][0] == "freellmapi:auto:fast", cands)

    def test_composition_root_main_is_exempted_and_skipped(self):
        vids = {f"{v['source_module']}->{v['target_module']}" for v in self.baseline["violations"]}
        self.assertNotIn("main->presentation.api", vids)
        self.assertNotIn("main->infrastructure.database", vids)
        main_node = next(n for n in self.baseline["nodes"] if n["id"] == "main")
        self.assertEqual(main_node["layer"], "CompositionRoot")

        synthetic = {
            **self.baseline,
            "violations": [
                {
                    "source_module": "main",
                    "target_module": "presentation.api",
                    "source_layer": "Application",
                    "target_layer": "Presentation",
                    "source_file": "main.py",
                    "reason": "Synthetic test",
                }
            ],
        }
        eligible, skipped = filter_eligible_violations(
            ECOMMERCE,
            synthetic,
            mode="single",
            target_violation_id="main->presentation.api",
        )
        self.assertEqual(eligible, [])
        self.assertEqual(len(skipped), 1)
        self.assertIn("composition root", skipped[0]["reason"])

    def test_410_eol_model_fails_over_and_freellmapi_has_backup_tier(self):
        from unittest.mock import patch
        from conformance.healing.agent import _is_provider_failure, _build_candidate_model, resolve_candidate_models

        eol_err = RuntimeError("Error code: 410 - {'detail': \"The model 'meta/llama-3.3-70b-instruct' has reached its end of life\"}")
        self.assertTrue(_is_provider_failure(eol_err))

        built = _build_candidate_model("nvidia", "dummy-key")
        self.assertIsNotNone(built)
        self.assertNotIn("llama-3.3-70b-instruct", built[0])

        with patch("conformance.healing.agent.load_ide_keys", return_value={"freellmapi": "freellmapi-test"}), \
             patch("conformance.healing.agent._probe_ollama_model", return_value=None):
            cands = resolve_candidate_models(model_override="freellmapi:auto")
        names = [name for name, _ in cands]
        self.assertEqual(names[:2], ["freellmapi:auto", "freellmapi:auto:fast"])

    def test_gather_sources_includes_existing_ports_and_sibling_importers(self):
        import tempfile
        from conformance.healing.agent import _gather_sources

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "domain").mkdir()
            (root / "infrastructure").mkdir()
            (root / "domain" / "ports.py").write_text("class ExistingPort:\n    pass\n", encoding="utf-8")
            (root / "domain" / "payment_rule.py").write_text("from .ports import ExistingPort\n", encoding="utf-8")
            (root / "domain" / "fraud_checker.py").write_text("from infrastructure.db import DB\n", encoding="utf-8")
            (root / "infrastructure" / "db.py").write_text("class DB:\n    pass\n", encoding="utf-8")

            gathered = _gather_sources(
                root,
                [{"source_module": "domain.fraud_checker", "target_module": "infrastructure.db", "source_file": "domain/fraud_checker.py"}],
            )
            self.assertIn("### domain/ports.py", gathered)
            self.assertIn("### domain/payment_rule.py", gathered)


if __name__ == "__main__":
    unittest.main(verbosity=2)
