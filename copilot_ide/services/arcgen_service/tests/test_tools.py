"""Offline tests for ArcGen native tool calling (registry, edge tools, Groq loop, fallback)."""

import json
import os
import unittest
from unittest.mock import MagicMock, patch

from pydantic import BaseModel

from app.llm import BaseLLMClient, GroqClient, ResilientLLMClient
from app.phase_b import edge_generator
from app.phase_b.edge_generator import generate_edges
from app.phase_b.edge_validator import validate_architecture
from app.schemas.architecture import ArchEdge, ArchNode, EdgeType, NodeType
from app.schemas.patterns import PatternProfile, TopologyType
from app.schemas.requirements import NormalizedRequirement, RequirementType, SRSDocument
from app.tools.edge_tools import SUBMIT_EDGES, build_edge_tools
from app.tools.registry import Tool, ToolRegistry


class EchoArgs(BaseModel):
    text: str


def _srs():
    return SRSDocument(
        project_name="T",
        functional_requirements=[
            NormalizedRequirement(req_id="FR-001", raw_text="User login", req_type=RequirementType.FUNCTIONAL),
        ],
    )


def _nodes():
    mk = lambda i, n, t: ArchNode(node_id=i, name=n, node_type=t, description=n, traced_requirements=["FR-001"])
    return [mk("COMP-001", "Gateway", NodeType.GATEWAY), mk("COMP-002", "Auth", NodeType.SERVICE),
            mk("COMP-003", "AuthDB", NodeType.DATASTORE)]


def _pattern():
    return PatternProfile(pattern_id="PAT-X", name="X", catalog_source="s",
                          topology_type=TopologyType.DISTRIBUTED, iso25010_impact={})


def _edge_dict(src="COMP-001", tgt="COMP-002", eid="EDGE-001"):
    return {"edge_id": eid, "source": src, "target": tgt, "edge_type": "sync_rest",
            "traced_requirements": ["FR-001"], "kb_citations": ["PAT-X"], "justification": "j"}


def _tool_reg():
    return ToolRegistry(build_edge_tools(_nodes(), _srs(), _pattern()))


class TestRegistry(unittest.TestCase):
    def setUp(self):
        self.reg = ToolRegistry([Tool("echo", "Echo", EchoArgs, lambda a: {"echo": a.text})])

    def test_valid_call(self):
        self.assertEqual(json.loads(self.reg.dispatch("echo", '{"text": "hi"}')), {"echo": "hi"})
        self.assertEqual(json.loads(self.reg.dispatch("echo", {"text": "hi"})), {"echo": "hi"})

    def test_unknown_tool(self):
        self.assertIn("error", json.loads(self.reg.dispatch("nope", "{}")))

    def test_bad_args(self):
        self.assertIn("error", json.loads(self.reg.dispatch("echo", '{"wrong": 1}')))
        self.assertIn("error", json.loads(self.reg.dispatch("echo", "not json")))

    def test_tool_exception_becomes_error(self):
        def boom(a):
            raise RuntimeError("x")
        reg = ToolRegistry([Tool("boom", "d", EchoArgs, boom)])
        self.assertIn("error", json.loads(reg.dispatch("boom", '{"text": "a"}')))

    def test_schema_shape_and_no_refs(self):
        schemas = _tool_reg().openai_schemas()
        names = {s["function"]["name"] for s in schemas}
        self.assertIn(SUBMIT_EDGES, names)
        for s in schemas:
            self.assertEqual(s["type"], "function")
            self.assertIn("properties", s["function"]["parameters"])
            self.assertNotIn("$ref", json.dumps(s))
            self.assertNotIn("$defs", json.dumps(s))


class TestEdgeTools(unittest.TestCase):
    def setUp(self):
        self.reg = _tool_reg()
        self.nodes, self.srs = _nodes(), _srs()

    def check(self, *edges):
        return json.loads(self.reg.dispatch("check_edges", {"edges": list(edges)}))

    def agree(self, src, tgt, reqs, kbs):
        edge = ArchEdge(edge_id="E", source=src, target=tgt, edge_type=EdgeType.SYNC_REST,
                        traced_requirements=reqs, kb_citations=kbs, justification="j")
        _, report = validate_architecture(self.nodes, [edge], self.srs)
        res = self.check({"edge_id": "E", "source": src, "target": tgt,
                          "traced_requirements": reqs, "kb_citations": kbs})
        self.assertEqual(not res["rejected"], report.rejected_edges_count == 0)
        if report.rejected_reasons:
            self.assertIn(res["rejected"][0]["reason"], report.rejected_reasons[0])
        self.assertEqual(res["orphans"], report.orphan_nodes)
        return res

    def test_agreement_with_validator(self):
        for src, tgt, reqs, kbs in [("COMP-001", "COMP-001", ["FR-001"], ["P"]),
                                    ("COMP-001", "COMP-999", ["FR-001"], ["P"]),
                                    ("COMP-001", "COMP-002", ["FR-404"], ["P"]),
                                    ("COMP-001", "COMP-002", ["FR-001"], [])]:
            self.assertEqual(len(self.agree(src, tgt, reqs, kbs)["rejected"]), 1)
        res = self.agree("COMP-001", "COMP-002", ["FR-001"], ["P"])
        self.assertEqual(res["rejected"], [])
        self.assertEqual(res["orphans"], ["COMP-003"])
        self.assertFalse(res["ok"])

    def test_all_clean_is_ok_and_extra_fields_ignored(self):
        res = self.check(_edge_dict(), {**_edge_dict("COMP-002", "COMP-003", "EDGE-002"), "protocol": "SQL"})
        self.assertTrue(res["ok"])
        self.assertEqual(res["accepted"], 2)

    def test_only_two_tools_offered(self):
        self.assertEqual([t["function"]["name"] for t in self.reg.openai_schemas()], ["check_edges", SUBMIT_EDGES])

    def test_submit_validates_edges(self):
        bad = json.loads(self.reg.dispatch(SUBMIT_EDGES, {"edges": [{"source": "a"}]}))
        self.assertIn("error", bad)
        ok = json.loads(self.reg.dispatch(SUBMIT_EDGES, {"edges": [_edge_dict()]}))
        self.assertEqual(ok["received"], 1)


def _resp(message=None, status=200, headers=None):
    r = MagicMock()
    r.status_code = status
    r.headers = headers or {}
    r.text = "err"
    r.json.return_value = {"choices": [{"message": message}]} if message else {}
    return r


def _call(name, args, cid):
    return {"id": cid, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def _msg(*calls):
    return {"role": "assistant", "content": None, "tool_calls": list(calls)}


class TestGroqRunTools(unittest.TestCase):
    def setUp(self):
        self.client = GroqClient(api_key="k", model="m")
        self.reg = _tool_reg()

    def run_loop(self, responses, **kw):
        sent = []

        def fake_post(url, headers=None, json=None, timeout=None):
            import copy
            sent.append(copy.deepcopy(json))
            return responses.pop(0)

        with patch("requests.post", side_effect=fake_post), patch("time.sleep"):
            res = self.client.run_tools("sys", "user", self.reg, SUBMIT_EDGES, **kw)
        return res, sent

    def test_check_then_submit(self):
        args = {"edges": [_edge_dict()]}
        events = []
        res, sent = self.run_loop(
            [_resp(_msg(_call("check_edges", {"edges": [_edge_dict(), _edge_dict("COMP-002", "COMP-003", "EDGE-002")]}, "c1"))),
             _resp(_msg(_call(SUBMIT_EDGES, args, "c2")))],
            on_event=events.append,
        )
        self.assertEqual(res["edges"][0]["source"], "COMP-001")
        self.assertEqual(len(sent), 2)
        self.assertIn("tools", sent[0])
        self.assertEqual(sent[0]["tool_choice"], "auto")
        self.assertNotIn("response_format", sent[0])
        tool_msgs = [m for m in sent[1]["messages"] if m["role"] == "tool"]
        self.assertEqual(tool_msgs[0]["tool_call_id"], "c1")
        self.assertTrue(json.loads(tool_msgs[0]["content"])["ok"])
        self.assertEqual([e["type"] for e in events], ["step", "tool_call", "tool_result", "step", "tool_call", "tool_result"])

    def test_step_cap_returns_none(self):
        call = lambda i: _resp(_msg(_call("check_edges", {"edges": []}, f"c{i}")))
        res, sent = self.run_loop([call(i) for i in range(3)], max_steps=3)
        self.assertIsNone(res)
        self.assertEqual(len(sent), 3)
        self.assertEqual(sent[0]["tool_choice"], "auto")
        self.assertEqual(sent[2]["tool_choice"], {"type": "function", "function": {"name": SUBMIT_EDGES}})
        self.assertEqual([t["function"]["name"] for t in sent[2]["tools"]], [SUBMIT_EDGES])
        self.assertGreater(len(sent[0]["tools"]), 1)

    def _tool_use_failed(self, name, args):
        r = _resp(status=400)
        r.json.return_value = {"error": {"code": "tool_use_failed", "failed_generation":
                                         json.dumps({"name": name, "arguments": args})}}
        return r

    def test_tool_use_failed_salvages_final_call(self):
        res, _ = self.run_loop([self._tool_use_failed(SUBMIT_EDGES, {"edges": [_edge_dict()]})])
        self.assertEqual(res["edges"][0]["source"], "COMP-001")

    def test_tool_use_failed_known_tool_is_recovered(self):
        res, sent = self.run_loop([
            self._tool_use_failed("check_edges", {"edges": [_edge_dict()]}),
            _resp(_msg(_call(SUBMIT_EDGES, {"edges": [_edge_dict()]}, "c2"))),
        ])
        self.assertIsNotNone(res)
        msgs = sent[1]["messages"]
        self.assertEqual(msgs[-2]["tool_calls"][0]["function"]["name"], "check_edges")
        self.assertEqual(msgs[-1]["role"], "tool")
        self.assertEqual(msgs[-1]["tool_call_id"], msgs[-2]["tool_calls"][0]["id"])

    def test_tool_use_failed_unknown_tool_gets_correction(self):
        res, sent = self.run_loop([
            self._tool_use_failed("made_up", {}),
            _resp(_msg(_call(SUBMIT_EDGES, {"edges": [_edge_dict()]}, "c2"))),
        ])
        self.assertIsNotNone(res)
        self.assertIn("invalid", sent[1]["messages"][-1]["content"])

    def test_other_400_still_raises(self):
        r = _resp(status=400)
        r.json.return_value = {"error": {"code": "something_else"}}
        with self.assertRaises(RuntimeError):
            self.run_loop([r])

    def test_echoed_assistant_message_is_sanitized(self):
        first = _msg(_call("check_edges", {"edges": []}, "c1"))
        first["reasoning"] = "internal chain of thought"
        _, sent = self.run_loop([_resp(first), _resp(_msg(_call(SUBMIT_EDGES, {"edges": [_edge_dict()]}, "c2")))])
        echoed = [m for m in sent[1]["messages"] if m["role"] == "assistant"][0]
        self.assertEqual(set(echoed), {"role", "content", "tool_calls"})

    def test_plain_text_twice_returns_none(self):
        text = lambda: _resp({"role": "assistant", "content": "here are edges"})
        res, sent = self.run_loop([text(), text()])
        self.assertIsNone(res)
        self.assertEqual(len(sent), 2)

    def test_plain_text_is_nudged_then_submits(self):
        res, sent = self.run_loop([
            _resp({"role": "assistant", "content": "here are edges"}),
            _resp(_msg(_call(SUBMIT_EDGES, {"edges": [_edge_dict()]}, "c1"))),
        ])
        self.assertIsNotNone(res)
        self.assertEqual(sent[1]["tool_choice"], {"type": "function", "function": {"name": SUBMIT_EDGES}})
        self.assertIn(SUBMIT_EDGES, sent[1]["messages"][-1]["content"])

    def test_429_retry_after(self):
        args = {"edges": [_edge_dict()]}
        with patch("requests.post", side_effect=[_resp(status=429, headers={"retry-after": "2"}),
                                                  _resp(_msg(_call(SUBMIT_EDGES, args, "c")))]) as post, \
                patch("time.sleep") as sleep:
            res = self.client.run_tools("s", "u", self.reg, SUBMIT_EDGES)
        self.assertIsNotNone(res)
        self.assertEqual(post.call_count, 2)
        sleep.assert_called_with(3.0)

    def test_invalid_final_args_fed_back(self):
        good = {"edges": [_edge_dict()]}
        res, sent = self.run_loop([_resp(_msg(_call(SUBMIT_EDGES, {"edges": [{"source": "x"}]}, "c1"))),
                                   _resp(_msg(_call(SUBMIT_EDGES, good, "c2")))])
        self.assertEqual(res, good)
        self.assertIn("error", [m for m in sent[1]["messages"] if m["role"] == "tool"][0]["content"])


class FakeToolClient(BaseLLMClient):
    def __init__(self, result=None, raises=False, tools=True):
        self.result, self.raises, self.tools = result, raises, tools
        self.model = "fake"
        self.tool_calls = 0
        self.json_calls = 0

    def supports_tools(self):
        return self.tools

    def run_tools(self, *a, **kw):
        self.tool_calls += 1
        if self.raises:
            raise RuntimeError("boom")
        return self.result

    def generate_json(self, *a, **kw):
        self.json_calls += 1
        return {"edges": [_edge_dict(eid="EDGE-JSON")]}


class TestResilientTools(unittest.TestCase):
    def test_failover_whole_loop(self):
        a, b = FakeToolClient(raises=True), FakeToolClient(result={"edges": []})
        r = ResilientLLMClient([a, b])
        self.assertTrue(r.supports_tools())
        self.assertEqual(r.run_tools("s", "u", None, "f"), {"edges": []})
        self.assertEqual((a.tool_calls, b.tool_calls), (1, 1))
        self.assertEqual(r.used_models, ["fake"])

    def test_non_tool_clients_skipped_and_all_fail_raises(self):
        plain, bad = FakeToolClient(tools=False), FakeToolClient(raises=True)
        r = ResilientLLMClient([plain, bad])
        with self.assertRaises(RuntimeError):
            r.run_tools("s", "u", None, "f")
        self.assertEqual(plain.tool_calls, 0)
        self.assertFalse(ResilientLLMClient([plain]).supports_tools())


class TestGenerateEdgesTools(unittest.TestCase):
    def gen(self, client):
        return generate_edges(_nodes(), _srs(), _pattern(), client=client)

    def test_flag_on_uses_tool_result(self):
        c = FakeToolClient(result={"edges": [_edge_dict(eid="EDGE-TOOL")]})
        with patch.dict(os.environ, {"ARCGEN_TOOLS": "1"}):
            edges = self.gen(c)
        self.assertEqual(edges[0].edge_id, "EDGE-TOOL")
        self.assertEqual(c.json_calls, 0)
        self.assertEqual({e.source for e in edges} | {e.target for e in edges},
                         {"COMP-001", "COMP-002", "COMP-003"})  # orphan pass still ran

    def test_none_falls_back(self):
        c = FakeToolClient(result=None)
        with patch.dict(os.environ, {"ARCGEN_TOOLS": "true"}):
            edges = self.gen(c)
        self.assertEqual(c.json_calls, 1)
        self.assertEqual(edges[0].edge_id, "EDGE-JSON")

    def test_exception_falls_back(self):
        c = FakeToolClient(raises=True)
        with patch.dict(os.environ, {"ARCGEN_TOOLS": "yes"}):
            self.gen(c)
        self.assertEqual(c.json_calls, 1)

    def test_flag_off_never_runs_tools(self):
        c = FakeToolClient(result={"edges": []})
        with patch.dict(os.environ, {"ARCGEN_TOOLS": ""}):
            self.gen(c)
        self.assertEqual(c.tool_calls, 0)
        self.assertEqual(c.json_calls, 1)

    def test_tool_prompt_drops_json_block(self):
        p = edge_generator._tool_system_prompt()
        self.assertNotIn("OUTPUT MUST BE VALID JSON", p)
        self.assertIn("submit_edges", p)


if __name__ == "__main__":
    unittest.main()
