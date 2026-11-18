"""Offline tests for the bias jury: no Ollama, no LLM. Fake jurors return scripted JSON."""

import json
import unittest
from unittest.mock import patch

from app.jury.aggregate import aggregate, parse_verdict
from app.jury.case import architecture_case, normalization_case
from app.jury.models import JurorSpec, load_rubric
from app.jury.pipeline import JuryRun, graph_diff
from app.jury.roster import family_of, select_panel
from app.schemas.architecture import ArchEdge, ArchitectureGraph, ArchNode, EdgeType, NodeType
from app.schemas.requirements import NormalizedRequirement, RequirementType, SRSDocument

RAW = "Users place orders.\nAdmins manage the catalog.\nHandle 200 requests per second."


def _req(rid, text, kind):
    return NormalizedRequirement(req_id=rid, raw_text=text, req_type=kind)


def _srs():
    return SRSDocument(
        project_name="MiniShop",
        functional_requirements=[_req("FR-001", "Place orders", RequirementType.FUNCTIONAL),
                                 _req("FR-002", "Manage catalog", RequirementType.FUNCTIONAL)],
        asrs=[_req("ASR-001", "200 rps", RequirementType.ARCHITECTURALLY_SIGNIFICANT)],
    )


def _graph(names=("OrderService", "OrderDB"), style="Modular Monolith"):
    nodes = [ArchNode(node_id=f"COMP-00{i}", name=n, node_type=NodeType.SERVICE, description=n,
                      traced_requirements=["FR-001"], kb_citations=["PAT-X"]) for i, n in enumerate(names, 1)]
    edges = [ArchEdge(edge_id="EDGE-001", source="COMP-001", target="COMP-002", edge_type=EdgeType.SYNC_REST,
                      traced_requirements=["FR-001"], kb_citations=["PAT-X"], justification="j")] if len(nodes) > 1 else []
    return ArchitectureGraph(project_name="MiniShop", style=style, nodes=nodes, edges=edges)


def _answers(**items):
    """_answers(N1=("no", ["L2"]), N2="yes") -> juror JSON text."""
    rows = []
    for k, v in items.items():
        verdict, cite = (v, []) if isinstance(v, str) else v
        rows.append({"item": k, "verdict": verdict, "cite": cite, "reason": "r"})
    return json.dumps({"answers": rows})


SPEC = JurorSpec(model="m", family="f")


class TestParseVerdict(unittest.TestCase):
    def setUp(self):
        self.rubric = load_rubric()
        self.cp = self.rubric.checkpoints["normalization"]
        self.case = normalization_case(RAW, _srs(), self.cp, seed=1)

    def test_no_with_valid_citation_counts(self):
        v = parse_verdict(_answers(N1=("no", ["L2"])), self.cp, self.case, "Juror 1", SPEC)
        self.assertTrue(v.ok)
        self.assertEqual(v.answers[0].cited, ["L2"])
        self.assertTrue(v.answers[0].counted)

    def test_uncited_or_invented_no_does_not_count(self):
        v = parse_verdict(_answers(N1=("no", []), N2=("no", ["NFR-999"])), self.cp, self.case, "Juror 1", SPEC)
        self.assertFalse(v.answers[0].counted)
        self.assertFalse(v.answers[1].counted)
        self.assertEqual(v.answers[1].rejected_cites, ["NFR-999"])

    def test_shotgun_citation_does_not_count(self):
        v = parse_verdict(_answers(N2=("no", ["FR-001", "FR-002", "ASR-001"])), self.cp, self.case, "Juror 1", SPEC)
        self.assertFalse(v.answers[0].counted)

    def test_garbage_output_abstains(self):
        v = parse_verdict("I think it is fine.", self.cp, self.case, "Juror 1", SPEC)
        self.assertFalse(v.ok)

    def test_mapping_style_answers_are_accepted(self):
        v = parse_verdict(json.dumps({"N1": "yes", "N2": {"verdict": "no", "cite": ["FR-002"]}}), self.cp, self.case, "J", SPEC)
        self.assertEqual({a.item_id: a.passed for a in v.answers}, {"N1": True, "N2": False})

    def test_thinking_tags_stripped_successfully(self):
        raw = "<think>Let me evaluate this carefully: {\"random\": 123}</think>\n```json\n" + _answers(N1="yes", N2=("no", ["FR-002"])) + "\n```"
        v = parse_verdict(raw, self.cp, self.case, "J", SPEC)
        self.assertTrue(v.ok)
        self.assertEqual({a.item_id: a.passed for a in v.answers}, {"N1": True, "N2": False})

    def test_regex_fallback_for_plain_text_answers(self):
        raw = "Reviewer assessment:\n* N1: yes - covered in full\n* N2: no - unsupported requirement (FR-002)\n* N3: yes"
        v = parse_verdict(raw, self.cp, self.case, "J", SPEC)
        self.assertTrue(v.ok)
        self.assertEqual(len(v.answers), 3)
        self.assertEqual({a.item_id: a.passed for a in v.answers}, {"N1": True, "N2": False, "N3": True})

    def test_prefixed_item_ids_and_question_text_resolved(self):
        norm_payload = json.dumps({
            "answers": [
                {"item": "N1. Is every requirement stated in the RAW SRS represented?", "verdict": "yes", "cite": [], "reason": "ok"},
                {"item": "N2. Is every NORMALIZED REQUIREMENT supported?", "verdict": "no", "cite": ["FR-002"], "reason": "missing"},
                {"item": "N3. Is every requirement marked ASR backed?", "verdict": "yes", "cite": [], "reason": "ok"},
            ]
        })
        v1 = parse_verdict(norm_payload, self.cp, self.case, "J", SPEC)
        self.assertTrue(v1.ok)
        self.assertEqual({a.item_id: a.passed for a in v1.answers}, {"N1": True, "N2": False, "N3": True})
        self.assertTrue(v1.answers[1].counted)

        arch_cp = self.rubric.checkpoints["architecture"]
        arch_case = architecture_case(_srs(), _graph(), arch_cp, seed=1)
        arch_payload = json.dumps({
            "answers": [
                {"question": "Is every ASR actually realized by at least one COMPONENT in the architecture?", "verdict": "yes", "cite": [], "reason": "ok"},
                {"question": "Is the chosen ARCHITECTURAL STYLE compatible with every ASR? (no)", "verdict": "no", "cite": ["ASR-001"], "reason": "conflict"},
                {"question": "Is every technology component (message broker, cache, queue, gateway, orchestrator, search engine) required by a requirement?", "verdict": "yes", "cite": [], "reason": "ok"},
                {"question": "Are the number and granularity of COMPONENTS proportionate to the scale?", "verdict": "yes", "cite": [], "reason": "ok"},
                {"question": "Does every CONNECTION represent a real call or data flow that a requirement needs?", "verdict": "yes", "cite": [], "reason": "ok"},
            ]
        })
        v2 = parse_verdict(arch_payload, arch_cp, arch_case, "J", SPEC)
        self.assertTrue(v2.ok)
        self.assertEqual({a.item_id: a.passed for a in v2.answers}, {"A1": True, "A2": False, "A3": True, "A4": True, "A5": True})
        self.assertEqual(v2.answers[1].cited, ["ASR-001"])
        self.assertTrue(v2.answers[1].counted)


class TestAggregate(unittest.TestCase):
    def setUp(self):
        self.cp = load_rubric().checkpoints["normalization"]
        self.case = normalization_case(RAW, _srs(), self.cp, seed=1)

    def _verdicts(self, texts):
        return [parse_verdict(t, self.cp, self.case, f"Juror {i}", JurorSpec(model=f"m{i}", family=f"f{i}"))
                for i, t in enumerate(texts, 1)]

    def test_strict_majority_fails_item_and_routes(self):
        vs = self._verdicts([_answers(N1=("no", ["L2"]))] * 3 + [_answers(N1="yes")] * 2)
        r = aggregate("normalization", self.cp, vs, 1, [], RAW)
        self.assertFalse(r.passed)
        self.assertEqual(r.routes, ["normalize"])
        self.assertIn('L2 "Admins manage the catalog."', r.feedback[0])

    def test_minority_or_tie_passes(self):
        vs = self._verdicts([_answers(N1=("no", ["L2"]))] * 2 + [_answers(N1="yes")] * 2)
        self.assertTrue(aggregate("normalization", self.cp, vs, 1, [], RAW).passed)

    def test_abstaining_juror_still_counts_toward_quorum(self):
        # 2 'no' out of 3 voting jurors (one gave garbage and is excluded) -> majority
        vs = self._verdicts([_answers(N1=("no", ["L2"]))] * 2 + [_answers(N1="yes"), "garbage"])
        r = aggregate("normalization", self.cp, vs, 1, [], RAW)
        self.assertEqual(r.voting_jurors, 3)
        self.assertFalse(r.passed)

    def test_low_independence_flag(self):
        vs = [parse_verdict(_answers(N1="yes"), self.cp, self.case, "J", JurorSpec(model="a", family="same"))] * 3
        self.assertTrue(aggregate("normalization", self.cp, vs, 1, [], RAW).low_independence)


class TestRoster(unittest.TestCase):
    def test_family_detection(self):
        self.assertEqual(family_of("gemini-2.5-flash"), "google")
        self.assertEqual(family_of("gemma3:4b"), "google")
        self.assertEqual(family_of("qwen2.5-coder:32b"), "qwen")
        self.assertEqual(family_of("openai/gpt-oss-120b"), "openai")

    def test_generator_family_replaced_by_spare(self):
        panel, excluded = select_panel(load_rubric(), ["gemini-2.5-flash"])
        self.assertEqual(excluded, ["google"])
        self.assertEqual(len(panel), 5)
        self.assertNotIn("google", {j.family for j in panel})
        self.assertIn("mistral", {j.family for j in panel})

    def test_spares_run_out(self):
        panel, _ = select_panel(load_rubric(), ["gemini-2.5-flash", "qwen2.5-coder:32b"])
        self.assertEqual(len(panel), 4)


class FakePanel:
    """Scripted jury: script[(checkpoint, attempt)] -> list of juror JSON texts."""

    def __init__(self, script):
        self.script = script
        self.calls = []

    def judge(self, checkpoint, seats, on_verdict):
        attempt = sum(1 for c in self.calls if c == checkpoint) + 1
        self.calls.append(checkpoint)
        texts = self.script.get((checkpoint, attempt), [None] * len(seats))
        cp = load_rubric().checkpoints[checkpoint]
        out = []
        for (seat, spec, case), text in zip(seats, texts):
            if text is None:  # default: everything passes
                text = json.dumps({"answers": [{"item": it.id, "verdict": "yes"} for it in cp.items]})
            v = parse_verdict(text, cp, case, seat, spec)
            on_verdict(v)
            out.append(v)
        return out


class BatchingPanel(FakePanel):
    """FakePanel that also offers judge_many and records which checkpoints shared a sitting."""

    def __init__(self, script):
        super().__init__(script)
        self.sittings = []

    def judge_many(self, sittings, on_verdict):
        self.sittings.append([cp for cp, _ in sittings])
        return {cp: self.judge(cp, seats, lambda v, c=cp: on_verdict(c, v)) for cp, seats in sittings}


class FakeClient:
    model = "gemini-2.5-flash"
    used_models = ["gemini-2.5-flash"]


class TestPipeline(unittest.TestCase):
    def _run(self, script, node_graphs, patterns=("Modular Monolith", "Layered Architecture")):
        """node_graphs: names per node-generation call. Returns (trace, events, generate_nodes mock)."""
        events = []
        ranked = [type("P", (), {"name": n, "pattern_id": n, "topology_type": None})() for n in patterns]
        calls = iter(node_graphs)

        def fake_nodes(**kw):
            return _graph(next(calls)).nodes

        def fake_edges(nodes, **kw):
            g = ArchitectureGraph(project_name="x", style="s", nodes=nodes)
            return _graph(tuple(n.name for n in nodes)).edges if len(nodes) > 1 else g.edges

        with patch("app.jury.pipeline.generate_nodes", side_effect=fake_nodes) as gn, \
             patch("app.jury.pipeline.generate_edges", side_effect=fake_edges) as ge, \
             patch("app.jury.pipeline.match_patterns", return_value=[]), \
             patch("app.jury.pipeline.rank_macro_patterns", return_value=ranked), \
             patch("app.jury.pipeline.select_companions", return_value=[]), \
             patch("app.jury.pipeline.format_tradeoff_table", return_value="table"), \
             patch("app.jury.pipeline.JuryRun._save"):
            normalize_calls = []

            def normalize(feedback):
                normalize_calls.append(feedback)
                return _srs()

            run = JuryRun(FakeClient(), FakePanel(script), events.append)
            graph, table, report, srs, trace = run.run(RAW, normalize)
        return trace, events, gn, ge, normalize_calls

    def test_all_pass_first_time(self):
        trace, events, gn, ge, norm = self._run({}, [("OrderService", "OrderDB")])
        self.assertEqual(trace.verdict, "PASS")
        self.assertEqual(len(trace.iterations), 1)
        self.assertEqual(norm, [None])
        self.assertIn("panel", {e["type"] for e in events})

    def test_normalization_failure_renormalizes_with_findings(self):
        bad = [_answers(N1=("no", ["L2"]))] * 5
        trace, _, gn, _, norm = self._run({("normalization", 1): bad}, [("OrderService", "OrderDB"), ("OrderService", "OrderDB")])
        self.assertEqual(len(norm), 2)
        self.assertIn("L2", norm[1][0])
        self.assertEqual(trace.verdict, "PASS")
        self.assertEqual(gn.call_count, 2)  # architecture rebuilt on the re-normalized SRS
        self.assertIn("re-normalized SRS", trace.iterations[1].reason)

    def test_generation_and_jury_are_batched_per_round(self):
        """Round 1: one sitting judges both checkpoints; later rounds judge only what changed."""
        bad = [_answers(A5=("no", ["EDGE-001"]))] * 5
        panel = BatchingPanel({("architecture", 1): bad})
        events = []
        with patch("app.jury.pipeline.generate_nodes", side_effect=lambda **kw: _graph(("OrderService", "OrderDB")).nodes), \
             patch("app.jury.pipeline.generate_edges", side_effect=lambda nodes, **kw: _graph(("OrderService", "OrderDB")).edges), \
             patch("app.jury.pipeline.match_patterns", return_value=[]), \
             patch("app.jury.pipeline.rank_macro_patterns", return_value=[type("P", (), {"name": "Modular Monolith"})()]), \
             patch("app.jury.pipeline.select_companions", return_value=[]), \
             patch("app.jury.pipeline.format_tradeoff_table", return_value="table"), \
             patch("app.jury.pipeline.JuryRun._save"):
            trace = JuryRun(FakeClient(), panel, events.append).run(RAW, lambda fb: _srs())[4]
        self.assertEqual(panel.sittings, [["normalization", "architecture"], ["architecture"]])
        self.assertEqual(trace.verdict, "PASS")
        # generation of a round finishes before its sitting starts
        kinds = [e["type"] for e in events]
        self.assertLess(kinds.index("iteration"), kinds.index("panel"))

    def test_style_rejection_steps_down_pattern(self):
        bad = [_answers(A2=("no", ["ASR-001"]))] * 5
        trace, _, gn, _, _ = self._run({("architecture", 1): bad}, [("OrderService", "OrderDB"), ("OrderModule", "OrderDB")])
        self.assertEqual(trace.pattern_stepdowns, ["Modular Monolith -> Layered Architecture"])
        self.assertEqual(trace.iterations[1].style, "Layered Architecture")
        self.assertEqual(trace.iterations[1].diff.style_changed, "Modular Monolith -> Layered Architecture")
        self.assertEqual(gn.call_count, 2)

    def test_edge_rejection_only_regenerates_edges(self):
        bad = [_answers(A5=("no", ["EDGE-001"]))] * 5
        trace, _, gn, ge, _ = self._run({("architecture", 1): bad}, [("OrderService", "OrderDB")])
        self.assertEqual(gn.call_count, 1)
        self.assertEqual(ge.call_count, 2)
        self.assertIn("EDGE-001", ge.call_args.kwargs["feedback"][0])

    def test_gives_up_after_max_regenerations_and_ships_fail(self):
        bad = [_answers(A3=("no", ["COMP-001"]))] * 5
        script = {("architecture", k): bad for k in (1, 2, 3)}
        trace, _, gn, _, _ = self._run(script, [("A", "B"), ("C", "D"), ("E", "F")])
        self.assertEqual(trace.verdict, "FAIL")
        self.assertEqual(len(trace.iterations), 3)  # initial + 2 regenerations
        self.assertEqual(trace.iterations[1].diff.nodes_added, ["C", "D"])

    def test_no_usable_jurors_means_no_jury(self):
        garbage = ["garbage"] * 5
        trace, _, _, _, _ = self._run({("normalization", 1): garbage}, [("OrderService", "OrderDB")])
        self.assertEqual(trace.verdict, "NO_JURY")
        self.assertEqual(len(trace.iterations), 1)


class TestDiffAndCases(unittest.TestCase):
    def test_diff_by_name(self):
        d = graph_diff(_graph(("A", "B")), _graph(("A", "C"), style="Other"))
        self.assertEqual((d.nodes_added, d.nodes_removed), (["C"], ["B"]))
        self.assertEqual(d.edges_added, ["A -> C"])

    def test_cases_are_shuffled_per_juror_but_hold_same_ids(self):
        cp = load_rubric().checkpoints["architecture"]
        g = _graph(tuple(f"N{i}" for i in range(8)))
        a, b = architecture_case(_srs(), g, cp, 1), architecture_case(_srs(), g, cp, 2)
        self.assertEqual(a.valid_ids, b.valid_ids)
        self.assertNotEqual(a.text, b.text)
        self.assertNotIn("gemini", a.text.lower())


class TestCloudJury(unittest.TestCase):
    def test_rubric_for_mode_cloud(self):
        rubric = load_rubric()
        cloud_rubric = rubric.for_mode(is_cloud=True)
        local_rubric = rubric.for_mode(is_cloud=False)
        self.assertEqual(len(local_rubric.jurors), 5)
        self.assertEqual(local_rubric.jurors[0].model, "qwen3:4b")
        self.assertEqual(len(cloud_rubric.jurors), 5)
        self.assertEqual(cloud_rubric.jurors[0].model, "llama-3.3-70b-versatile")
        self.assertTrue(any(j.family == "openai" for j in cloud_rubric.jurors))
        self.assertTrue(any(j.family == "qwen" for j in cloud_rubric.jurors))
        self.assertTrue(any(j.family == "deepseek" for j in cloud_rubric.jurors))

    def test_deepseek_family_detected_before_qwen(self):
        self.assertEqual(family_of("deepseek-r1-distill-qwen-32b"), "deepseek")
        self.assertEqual(family_of("qwen/qwen3.8-27b"), "qwen")
        self.assertEqual(family_of("openai/gpt-oss-120b"), "openai")

    def test_cloud_jury_provider_filtering(self):
        rubric = load_rubric()
        groq_only = rubric.for_mode(is_cloud=True, available_providers={"groq"})
        self.assertTrue(all(j.provider == "groq" for j in groq_only.jurors))
        self.assertTrue(all(s.provider == "groq" for s in groq_only.spares))
        self.assertFalse(any(s.model == "gemini-2.5-flash" for s in groq_only.spares))

        both = rubric.for_mode(is_cloud=True, available_providers={"groq", "omnikey"})
        self.assertTrue(any(s.model == "gemini-2.5-flash" for s in both.spares))

    def test_groq_jury_excludes_generator_family_and_avoids_missing_provider(self):
        rubric = load_rubric().for_mode(is_cloud=True, available_providers={"groq"})
        panel, excluded = select_panel(rubric, ["openai/gpt-oss-120b"])
        self.assertIn("openai", excluded)
        # None of the jurors should belong to the generator's family (openai)
        self.assertTrue(all(j.family != "openai" for j in panel))
        # None of the jurors should require omnikey/gemini
        self.assertTrue(all(j.provider == "groq" for j in panel))
        self.assertFalse(any(j.model == "gemini-2.5-flash" for j in panel))
        # All jurors are distinct models
        models = [j.model for j in panel]
        self.assertEqual(len(models), len(set(models)))

    def test_cloud_jury_live_models_filtering(self):
        live = ["allam-2-7b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
        rubric = load_rubric().for_mode(is_cloud=True, available_providers={"groq"}, available_models=live)
        # Verify dead models are filtered out
        all_models = {j.model for j in rubric.jurors} | {s.model for s in rubric.spares}
        self.assertNotIn("llama-3.3-70b-versatile", all_models)
        self.assertNotIn("deepseek-r1-distill-qwen-32b", all_models)
        self.assertIn("qwen/qwen3.8-27b", all_models)
        self.assertIn("allam-2-7b", all_models)
        # Test panel selection with generator = openai/gpt-oss-120b
        panel, excluded = select_panel(rubric, ["openai/gpt-oss-120b"])
        self.assertIn("openai", excluded)
        self.assertTrue(len(panel) >= 2)
        # All seated models are live models
        for j in panel:
            self.assertIn(j.model, live)

    def test_blocked_models_filtered_and_panel_falls_back_to_unblocked_models(self):
        from app.llm import BLOCKED_MODELS, mark_model_blocked

        BLOCKED_MODELS.clear()
        try:
            mark_model_blocked("qwen/qwen3.8-27b")
            mark_model_blocked("allam-2-7b")
            live = ["allam-2-7b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
            rubric = load_rubric().for_mode(is_cloud=True, available_providers={"groq"}, available_models=live)
            all_models = {j.model for j in rubric.jurors} | {s.model for s in rubric.spares}
            self.assertNotIn("qwen/qwen3.8-27b", all_models)
            self.assertNotIn("allam-2-7b", all_models)
            self.assertIn("openai/gpt-oss-20b", all_models)
            self.assertIn("openai/gpt-oss-120b", all_models)

            panel, excluded = select_panel(rubric, ["openai/gpt-oss-120b"])
            self.assertIn("openai", excluded)
            seated = [j.model for j in panel]
            self.assertEqual(seated, ["openai/gpt-oss-20b"])

            # If even 20b is blocked, fall back to the remaining live model rather than empty panel
            mark_model_blocked("openai/gpt-oss-20b")
            rubric_last = load_rubric().for_mode(is_cloud=True, available_providers={"groq"}, available_models=live)
            panel_last, _ = select_panel(rubric_last, ["openai/gpt-oss-120b"])
            self.assertEqual([j.model for j in panel_last], ["openai/gpt-oss-120b"])
        finally:
            BLOCKED_MODELS.clear()

    def test_three_jurors_seated_when_few_non_generator_families_exist(self):
        live = ["allam-2-7b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
        rubric = load_rubric().for_mode(is_cloud=True, available_providers={"groq"}, available_models=live)
        panel, excluded = select_panel(rubric, ["openai/gpt-oss-120b"])
        self.assertIn("openai", excluded)
        seated = [j.model for j in panel]
        self.assertEqual(len(seated), 3)
        self.assertEqual(set(seated), {"qwen/qwen3.8-27b", "allam-2-7b", "openai/gpt-oss-20b"})
        self.assertNotIn("openai/gpt-oss-120b", seated)

    def test_adk_panel_swaps_blocked_models_and_falls_back_to_groq(self):
        try:
            from app.jury.panel import JUROR_ERROR, AdkJuryPanel
        except ImportError:
            self.skipTest("google-adk not installed in this environment")
        from unittest.mock import MagicMock
        from app.llm import BLOCKED_MODELS

        BLOCKED_MODELS.clear()
        try:
            live = ["allam-2-7b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
            rubric = load_rubric().for_mode(is_cloud=True, available_providers={"groq"}, available_models=live)
            panel = AdkJuryPanel(rubric=rubric, is_cloud=True, api_keys={"groq": "gsk_test"})
            cp = rubric.checkpoints["normalization"]
            case = normalization_case(RAW, _srs(), cp, seed=1)
            seats = [
                ("Juror 1", JurorSpec(model="qwen/qwen3.8-27b", family="qwen", provider="groq", fmt="no_think"), case),
                ("Juror 2", JurorSpec(model="allam-2-7b", family="allam", provider="groq", fmt="json"), case),
            ]

            class _FakeEvent:
                def __init__(self, text):
                    part = type("P", (), {"text": text, "thought": False})()
                    self.content = type("C", (), {"parts": [part]})()

                def is_final_response(self):
                    return True

            class _FakeRunner:
                def __init__(self, agent, app_name=None):
                    self.agent = agent
                    self.session_service = MagicMock()

                    async def _create_session(**kw):
                        return type("S", (), {"id": "sess-1"})()

                    self.session_service.create_session = _create_session

                async def run_async(self, **kw):
                    m = self.agent.model.model
                    if "qwen3.8" in m or "allam" in m:
                        yield _FakeEvent(f'{JUROR_ERROR} APIError: 403 model_permission_blocked_org')
                    else:
                        yield _FakeEvent(_answers(N1="yes", N2="yes", N3="yes"))

                async def close(self):
                    return None

            emitted = []
            with patch("app.jury.panel.InMemoryRunner", _FakeRunner):
                res = panel.judge_many([("normalization", seats)], lambda c, v: emitted.append(v))
            verdicts = res["normalization"]
            self.assertEqual(len(verdicts), 2)
            self.assertTrue(all(v.ok for v in verdicts))
            self.assertEqual({v.model for v in verdicts}, {"openai/gpt-oss-20b", "openai/gpt-oss-120b"})
            self.assertEqual(len(emitted), 2)
        finally:
            BLOCKED_MODELS.clear()


if __name__ == "__main__":
    unittest.main()
