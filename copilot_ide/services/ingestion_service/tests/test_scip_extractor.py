"""Unit tests for Python symbol extraction in the SCIP-style extractor."""

import sys
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.scip_extractor import SCIPExtractor  # noqa: E402

NESTED = textwrap.dedent('''
    from fastapi import APIRouter

    try:
        from real import router
    except Exception:
        router = APIRouter()

        @router.get("/status")
        def status():
            return {"status": "error"}

    def helper(x):
        return x

    def outer(items):
        def inner(x):
            return helper(x)
        return [inner(i) for i in items]

    async def generate(req):
        async def token_stream():
            """Streams tokens back to the client."""
            yield await llm_call(req)
        return token_stream

    class Pattern:
        class Config:
            frozen = True

        def method(self):
            return outer([])
''')

BROKEN = textwrap.dedent('''
    ---
    <<< SEARCH
    import os

    def send_sms(to, body):
        """Sends an SMS."""
        return post(to, body)
    ======
    def send_sms(to, body):
        return post(to, body)
    >>>>>> REPLACE
''')


def ids(nodes):
    return {n["id"] for n in nodes}


def calls_from(edges, source):
    return {e["target"] for e in edges if e["source"] == source and e["relationship"] == "CALLS"}


class TestNestedSymbols(unittest.TestCase):
    def setUp(self):
        self.chunks, self.nodes, self.edges = SCIPExtractor().extract_file("pkg/mod.py", NESTED)

    def test_top_level_and_method_ids_unchanged(self):
        for node_id in ("func:pkg/mod.py:outer", "func:pkg/mod.py:generate",
                        "class:pkg/mod.py:Pattern", "func:pkg/mod.py:Pattern.method"):
            self.assertIn(node_id, ids(self.nodes))

    def test_nested_defs_use_qualname(self):
        self.assertIn("func:pkg/mod.py:outer.<locals>.inner", ids(self.nodes))
        self.assertIn("func:pkg/mod.py:generate.<locals>.token_stream", ids(self.nodes))
        self.assertIn("class:pkg/mod.py:Pattern.Config", ids(self.nodes))

    def test_nested_def_is_contained_by_its_parent(self):
        self.assertIn({"source": "func:pkg/mod.py:outer", "target": "func:pkg/mod.py:outer.<locals>.inner",
                       "relationship": "CONTAINS"}, self.edges)

    def test_route_inside_except_block_is_an_endpoint(self):
        self.assertIn("endpoint:pkg/mod.py:GET /status", ids(self.nodes))
        self.assertIn("func:pkg/mod.py:status", ids(self.nodes))

    def test_same_route_in_two_services_stays_two_endpoints(self):
        graph = SCIPExtractor().index_codebase([
            {"path": "svc_a/main.py", "content": NESTED},
            {"path": "svc_b/main.py", "content": NESTED},
        ])["graph"]
        status = [n for n in graph["nodes"] if n["kind"] == "endpoint" and n["label"] == "GET /status"]
        self.assertEqual(sorted(n["file_path"] for n in status), ["svc_a/main.py", "svc_b/main.py"])

    def test_calls_belong_to_the_innermost_function(self):
        edges = SCIPExtractor().index_codebase([{"path": "pkg/mod.py", "content": NESTED}])["graph"]["edges"]
        self.assertEqual(calls_from(edges, "func:pkg/mod.py:outer.<locals>.inner"), {"func:pkg/mod.py:helper"})
        self.assertEqual(calls_from(edges, "func:pkg/mod.py:outer"), {"func:pkg/mod.py:outer.<locals>.inner"})

    def test_small_closures_get_no_chunk_but_documented_ones_do(self):
        names = {c["symbol_name"] for c in self.chunks}
        self.assertNotIn("inner", names)
        self.assertIn("token_stream", names)


class TestSyntaxErrors(unittest.TestCase):
    def test_parse_error_is_recorded_on_the_file_node(self):
        _, nodes, _ = SCIPExtractor().extract_file("bad.py", BROKEN)
        file_node = next(n for n in nodes if n["kind"] == "file")
        self.assertTrue(file_node["parse_error"].startswith("line "))

    def test_index_stats_count_parse_errors(self):
        stats = SCIPExtractor().index_codebase([
            {"path": "bad.py", "content": BROKEN},
            {"path": "pkg/mod.py", "content": NESTED},
        ])["stats"]
        self.assertEqual(stats["parse_errors"], 1)

    def test_without_tree_sitter_only_the_file_node_remains(self):
        extractor = SCIPExtractor()
        extractor._ts_python, extractor.has_treesitter = None, False
        _, nodes, _ = extractor.extract_file("bad.py", BROKEN)
        self.assertEqual([n["kind"] for n in nodes], ["file"])

    @unittest.skipUnless(SCIPExtractor().has_treesitter, "tree-sitter-python not installed")
    def test_tree_sitter_recovers_both_definitions(self):
        chunks, nodes, edges = SCIPExtractor().extract_file("bad.py", BROKEN)
        funcs = [n for n in nodes if n["kind"] == "function"]
        self.assertEqual([n["id"] for n in funcs], ["func:bad.py:send_sms", f"func:bad.py:send_sms@{funcs[1]['line_start']}"])
        self.assertTrue(all(n["precision"] == "partial" for n in funcs))
        self.assertEqual(funcs[0]["docstring"], "Sends an SMS.")
        self.assertEqual(funcs[0]["signature"], "def send_sms(to, body)")
        self.assertIn("func:post", calls_from(edges, "func:bad.py:send_sms"))


REPO = {
    "pkg/__init__.py": "from .core import build\n",
    "pkg/core.py": textwrap.dedent('''
        import os
        import json as j
        from .util import slug
        from . import util

        def build(x):
            os.path.join("a", "b")
            print(x)
            return slug(x) + util.trim(x)

        class Graph:
            def add(self):
                return self.validate()

            def validate(self):
                return True
    '''),
    "pkg/util.py": textwrap.dedent('''
        def slug(s):
            return s

        def trim(s):
            return s

        def run():
            return trim("x")
    '''),
    "app/main.py": textwrap.dedent('''
        from pkg import build
        from pkg.core import Graph
        import pkg.util as u

        def main():
            g = Graph()
            g.add()
            Graph.validate(g)
            u.run()
            return build(1)
    '''),
    "other/a.py": "def run():\n    pass\n\ndef only_here():\n    pass\n",
    "other/b.py": "def caller():\n    run()\n    only_here()\n",
}


class TestEdgeResolution(unittest.TestCase):
    def setUp(self):
        result = SCIPExtractor().index_codebase([{"path": p, "content": c} for p, c in REPO.items()])
        self.nodes = {n["id"]: n for n in result["graph"]["nodes"]}
        self.edges = result["graph"]["edges"]
        self.stats = result["stats"]

    def imports_of(self, path):
        return {e["target"] for e in self.edges if e["source"] == f"file:{path}" and e["relationship"] == "IMPORTS"}

    def test_every_edge_points_at_a_real_node(self):
        for e in self.edges:
            self.assertIn(e["source"], self.nodes, e)
            self.assertIn(e["target"], self.nodes, e)
            self.assertFalse({"_call", "_import"} & set(e), e)

    def test_relative_absolute_and_aliased_imports_resolve_to_files(self):
        self.assertEqual(self.imports_of("pkg/core.py"), {"file:pkg/util.py"})
        self.assertEqual(self.imports_of("pkg/__init__.py"), {"file:pkg/core.py"})
        self.assertEqual(self.imports_of("app/main.py"),
                         {"file:pkg/__init__.py", "file:pkg/core.py", "file:pkg/util.py"})

    def test_every_chunk_is_tagged_as_codebase(self):
        chunks = SCIPExtractor().index_codebase([{"path": p, "content": c} for p, c in REPO.items()])["chunks"]
        self.assertTrue(chunks)
        self.assertEqual({c["origin"] for c in chunks}, {"codebase"})

    def test_external_imports_are_listed_on_the_file_node(self):
        self.assertEqual(self.nodes["file:pkg/core.py"]["external_imports"], ["json", "os"])

    def test_calls_resolve_through_imports_and_self(self):
        self.assertEqual(calls_from(self.edges, "func:pkg/core.py:build"),
                         {"func:pkg/util.py:slug", "func:pkg/util.py:trim"})
        self.assertEqual(calls_from(self.edges, "func:pkg/core.py:Graph.add"), {"func:pkg/core.py:Graph.validate"})
        self.assertEqual(calls_from(self.edges, "func:pkg/util.py:run"), {"func:pkg/util.py:trim"})

    def test_calls_from_another_package(self):
        # Graph() is the class, build() follows the pkg/__init__ re-export, g.add() has an unknown receiver
        self.assertEqual(calls_from(self.edges, "func:app/main.py:main"), {
            "class:pkg/core.py:Graph", "func:pkg/core.py:Graph.validate",
            "func:pkg/util.py:run", "func:pkg/core.py:build",
        })

    def test_ambiguous_names_are_dropped_not_guessed(self):
        self.assertEqual(calls_from(self.edges, "func:other/b.py:caller"), {"func:other/a.py:only_here"})
        self.assertGreater(self.stats["unresolved_calls"], 0)


if __name__ == "__main__":
    unittest.main()
