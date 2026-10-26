import os
import ast
import re
import hashlib
import inspect
from typing import List, Dict, Any, Tuple, Optional

def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

class _PyFileOut:
    """Per-file output lists plus the symbol ids already used in that file."""

    def __init__(self, rel_path: str, lines: List[str]):
        self.rel_path = rel_path
        self.lines = lines
        self.chunks: List[Dict[str, Any]] = []
        self.nodes: List[Dict[str, Any]] = []
        self.edges: List[Dict[str, Any]] = []
        self._seen_ids = set()

    def unique_id(self, base: str, line: int) -> str:
        # A redefinition (property setter, if/else variants, a block duplicated in a
        # broken file) gets its line appended instead of being dropped at dedup.
        node_id = base if base not in self._seen_ids else f"{base}@{line}"
        self._seen_ids.add(node_id)
        return node_id

def _qualname(parent_qual: str, parent_kind: str, name: str) -> str:
    """Same naming as Python's __qualname__: Class.method, outer.<locals>.inner."""
    if not parent_qual:
        return name
    return f"{parent_qual}.<locals>.{name}" if parent_kind == "function" else f"{parent_qual}.{name}"

def _wants_chunk(parent_kind: str, docstring: str, start_l: int, end_l: int) -> bool:
    # A nested def's code is already in its parent's chunk; only give it its own
    # search chunk when it carries extra signal (docstring) or is sizeable.
    return parent_kind != "function" or bool(docstring) or (end_l - start_l + 1) > 8

def _py_signature(node: Any) -> str:
    args_list = []
    for a in node.args.args:
        arg_str = a.arg
        if a.annotation:
            arg_str += f": {ast.unparse(a.annotation)}"
        args_list.append(arg_str)
    ret_str = f" -> {ast.unparse(node.returns)}" if node.returns else ""
    prefix = "async def " if isinstance(node, ast.AsyncFunctionDef) else "def "
    return f"{prefix}{node.name}({', '.join(args_list)}){ret_str}"

def _own_ast_calls(func: Any) -> List[str]:
    """Names called by this function itself; nested defs/classes report their own calls."""
    names = []
    stack = [func]
    while stack:
        cur = stack.pop()
        if isinstance(cur, ast.Call):
            if isinstance(cur.func, ast.Name):
                names.append(cur.func.id)
            elif isinstance(cur.func, ast.Attribute):
                names.append(cur.func.attr)
        for child in ast.iter_child_nodes(cur):
            if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                stack.append(child)
    return names

class _PySymbolVisitor(ast.NodeVisitor):
    """
    Visits every def/class at any depth (inside other defs and module-level
    if/try/with blocks), keeping a scope stack so ids follow __qualname__.
    """

    def __init__(self, extractor: "SCIPExtractor", out: _PyFileOut, file_node_id: str):
        self.extractor = extractor
        self.out = out
        self.scope = [(file_node_id, "", "file")]  # (node_id, qualname, kind)

    def visit_ClassDef(self, node: ast.ClassDef):
        parent_id, parent_qual, parent_kind = self.scope[-1]
        qualname = _qualname(parent_qual, parent_kind, node.name)
        start_l = node.lineno
        end_l = getattr(node, 'end_lineno', start_l + 10)
        docstring = ast.get_docstring(node) or ""
        class_id = self.extractor._emit_py_class(self.out, node.name, qualname, parent_id, start_l, end_l, docstring,
                                                 with_chunk=_wants_chunk(parent_kind, docstring, start_l, end_l))
        self.scope.append((class_id, qualname, "class"))
        self.generic_visit(node)
        self.scope.pop()

    def visit_FunctionDef(self, node: Any):
        parent_id, parent_qual, parent_kind = self.scope[-1]
        qualname = _qualname(parent_qual, parent_kind, node.name)
        start_l = node.lineno
        end_l = getattr(node, 'end_lineno', start_l + 15)
        docstring = ast.get_docstring(node) or ""
        decorators = [ast.unparse(dec) for dec in node.decorator_list]
        func_id = self.extractor._emit_py_func(self.out, node.name, qualname, parent_id, start_l, end_l,
                                               _py_signature(node), docstring, decorators, _own_ast_calls(node),
                                               with_chunk=_wants_chunk(parent_kind, docstring, start_l, end_l))
        self.scope.append((func_id, qualname, "function"))
        self.generic_visit(node)
        self.scope.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

def _ts_text(ts_node: Any) -> str:
    return ts_node.text.decode("utf-8", errors="replace")

def _ts_docstring(body: Any) -> str:
    if body is None or not body.named_children:
        return ""
    first = body.named_children[0]
    if first.type == "expression_statement" and first.named_children and first.named_children[0].type == "string":
        try:
            return inspect.cleandoc(ast.literal_eval(_ts_text(first.named_children[0])))
        except Exception:
            return ""
    return ""

def _ts_own_calls(body: Any) -> List[Any]:
    """tree-sitter call nodes in this body, not descending into nested defs/classes."""
    calls = []
    stack = [body] if body is not None else []
    while stack:
        cur = stack.pop()
        if cur.type == "call":
            calls.append(cur)
        for child in cur.children:
            if child.type not in ("function_definition", "class_definition", "decorated_definition"):
                stack.append(child)
    return calls

def _ts_call_name(call: Any) -> str:
    fn = call.child_by_field_name("function")
    if fn is None:
        return ""
    if fn.type == "identifier":
        return _ts_text(fn)
    if fn.type == "attribute":
        attr = fn.child_by_field_name("attribute")
        return _ts_text(attr) if attr is not None else ""
    return ""

class SCIPExtractor:
    """
    Local Sourcegraph SCIP-style Multi-Language Code Intelligence Extractor.
    Extracts high-signal symbols (Endpoints, Functions, Classes) and builds
    a deterministic Knowledge Graph (CONTAINS, ROUTES_TO, CALLS, IMPORTS)
    while stripping junk comments and boilerplate.
    """

    def __init__(self):
        # Optional tree-sitter Python parser, used to recover symbols from files ast can't parse
        self._ts_python = None
        try:
            import tree_sitter_python
            from tree_sitter import Language, Parser
            self._ts_python = Parser(Language(tree_sitter_python.language()))
        except Exception:  # not installed, or an incompatible binding version
            self._ts_python = None
        self.has_treesitter = self._ts_python is not None

    def extract_file(self, rel_path: str, content: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Extracts symbols, graph nodes/edges, and semantic chunks from a file.
        Returns: (chunks, nodes, edges)
        """
        ext = os.path.splitext(rel_path)[1].lower()
        if ext == '.py':
            return self._extract_python(rel_path, content)
        elif ext in ['.ts', '.tsx', '.js', '.jsx']:
            return self._extract_js_ts(rel_path, content)
        elif ext == '.go':
            return self._extract_go(rel_path, content)
        elif ext in ['.yaml', '.yml', '.json']:
            return self._extract_spec_or_config(rel_path, content)
        elif ext in ['.md', '.markdown']:
            return self._extract_markdown(rel_path, content)
        else:
            return [], [], []

    def _extract_python(self, rel_path: str, content: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        lines = content.splitlines()
        out = _PyFileOut(rel_path, lines)

        file_node_id = f"file:{rel_path}"
        file_node = {
            "id": file_node_id,
            "label": os.path.basename(rel_path),
            "kind": "file",
            "file_path": rel_path,
            "language": "python",
            "line_start": 1,
            "line_end": len(lines)
        }
        out.nodes.append(file_node)

        try:
            tree = ast.parse(content)
        except (SyntaxError, ValueError) as e:
            # ValueError: source contains null bytes. Record why, then recover what we can.
            line = getattr(e, "lineno", None)
            msg = getattr(e, "msg", None) or str(e)
            file_node["parse_error"] = f"line {line}: {msg}" if line else msg
            self._extract_python_partial(out, file_node_id, content)
            return out.chunks, out.nodes, out.edges

        # Track imports for edge creation
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                mod_name = getattr(node, 'module', None) or (node.names[0].name if node.names else "")
                if mod_name:
                    out.edges.append({
                        "source": file_node_id,
                        "target": f"file:{mod_name}",
                        "relationship": "IMPORTS"
                    })

        # Classes and functions at any depth
        _PySymbolVisitor(self, out, file_node_id).visit(tree)

        return out.chunks, out.nodes, out.edges

    def _extract_python_partial(self, out: "_PyFileOut", file_node_id: str, content: str):
        """
        Best-effort symbols for a file ast can't parse. tree-sitter keeps going past
        errors (the broken span becomes an ERROR node), so the defs around it survive.
        """
        if not self.has_treesitter:
            return
        root = self._ts_python.parse(content.encode("utf-8")).root_node
        self._walk_ts_python(out, root, [(file_node_id, "", "file")])

    def _walk_ts_python(self, out: "_PyFileOut", ts_node: Any, scope: List[Tuple[str, str, str]]):
        for child in ts_node.children:
            target, decorators = child, []
            if child.type == "decorated_definition":
                decorators = [_ts_text(d).lstrip("@").strip() for d in child.children if d.type == "decorator"]
                target = child.child_by_field_name("definition") or child

            name_node = target.child_by_field_name("name")
            body = target.child_by_field_name("body")
            if target.type not in ("function_definition", "class_definition") or name_node is None:
                self._walk_ts_python(out, child, scope)
                continue

            parent_id, parent_qual, parent_kind = scope[-1]
            name = _ts_text(name_node)
            qualname = _qualname(parent_qual, parent_kind, name)
            start_l = target.start_point[0] + 1
            end_l = target.end_point[0] + 1
            docstring = _ts_docstring(body)
            with_chunk = _wants_chunk(parent_kind, docstring, start_l, end_l)

            if target.type == "class_definition":
                sym_id = self._emit_py_class(out, name, qualname, parent_id, start_l, end_l, docstring,
                                             with_chunk=with_chunk, precision="partial")
                kind = "class"
            else:
                params = target.child_by_field_name("parameters")
                ret = target.child_by_field_name("return_type")
                is_async = any(c.type == "async" for c in target.children)
                signature = f"{'async def ' if is_async else 'def '}{name}{' '.join(_ts_text(params).split()) if params else '()'}"
                if ret is not None:
                    signature += f" -> {_ts_text(ret)}"
                calls = [_ts_call_name(c) for c in _ts_own_calls(body)]
                sym_id = self._emit_py_func(out, name, qualname, parent_id, start_l, end_l, signature, docstring,
                                            decorators, calls, with_chunk=with_chunk, precision="partial")
                kind = "function"

            if body is not None:
                self._walk_ts_python(out, body, scope + [(sym_id, qualname, kind)])

    def _emit_py_class(self, out: "_PyFileOut", name: str, qualname: str, parent_id: str,
                       start_l: int, end_l: int, docstring: str,
                       with_chunk: bool = True, precision: Optional[str] = None) -> str:
        rel_path, lines = out.rel_path, out.lines
        class_node_id = out.unique_id(f"class:{rel_path}:{qualname}", start_l)
        class_code = "\n".join(lines[start_l - 1:min(end_l, start_l + 30)])

        class_node = {
            "id": class_node_id,
            "label": f"class {name}",
            "kind": "class",
            "file_path": rel_path,
            "line_start": start_l,
            "line_end": end_l,
            "signature": f"class {name}",
            "docstring": docstring,
            "language": "python",
            "code_snippet": class_code
        }
        if precision:
            class_node["precision"] = precision
        out.nodes.append(class_node)
        out.edges.append({
            "source": parent_id,
            "target": class_node_id,
            "relationship": "CONTAINS"
        })

        # Class chunk
        if with_chunk:
            chunk_text = f"[Code Symbol: class] class {name}\nFile: {rel_path} (Lines {start_l}-{end_l})\n"
            if docstring:
                chunk_text += f"Docstring: {docstring}\n"
            chunk_text += f"Code Snippet:\n{class_code}"
            out.chunks.append({
                "source": rel_path,
                "api_title": f"Class: {name}",
                "endpoint": f"class {name}",
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": name,
                "symbol_kind": "class",
                "file_path": rel_path,
                "line_range": f"L{start_l}-L{end_l}",
                "language": "python",
                "text": chunk_text
            })
        return class_node_id

    def _emit_py_func(self, out: "_PyFileOut", func_name: str, qualname: str, parent_id: str,
                      start_l: int, end_l: int, signature: str, docstring: str,
                      decorators: List[str], calls: List[str],
                      with_chunk: bool = True, precision: Optional[str] = None) -> str:
        rel_path, lines = out.rel_path, out.lines
        nodes, edges, chunks = out.nodes, out.edges, out.chunks

        func_code = "\n".join(lines[start_l - 1:end_l])
        func_node_id = out.unique_id(f"func:{rel_path}:{qualname}", start_l)

        # Detect Web API Endpoints (FastAPI, Flask, Starlette decorators)
        api_route_info = None
        for dec_text in decorators:
            route_match = re.search(r'\.(get|post|put|delete|patch|options)\s*\(\s*["\']([^"\']+)["\']', dec_text, re.IGNORECASE)
            if route_match:
                http_verb = route_match.group(1).upper()
                route_path = route_match.group(2)
                api_route_info = (http_verb, route_path)
                break

        if api_route_info:
            http_verb, route_path = api_route_info
            endpoint_id = f"endpoint:{rel_path}:{http_verb} {route_path}"
            endpoint_node = {
                "id": endpoint_id,
                "label": f"{http_verb} {route_path}",
                "kind": "endpoint",
                "file_path": rel_path,
                "line_start": start_l,
                "line_end": end_l,
                "method": http_verb,
                "path": route_path,
                "handler": func_name,
                "signature": signature,
                "docstring": docstring,
                "language": "python",
                "code_snippet": "\n".join(lines[start_l - 1:min(end_l, start_l + 25)])
            }
            if precision:
                endpoint_node["precision"] = precision
            nodes.append(endpoint_node)
            edges.append({
                "source": parent_id,
                "target": endpoint_id,
                "relationship": "CONTAINS"
            })
            edges.append({
                "source": endpoint_id,
                "target": func_node_id,
                "relationship": "ROUTES_TO"
            })

            # High-signal API chunk
            chunk_text = (
                f"[Code Symbol: API Route] {http_verb} {route_path}\n"
                f"Handler Function: {signature}\n"
                f"File: {rel_path} (Lines {start_l}-{end_l})\n"
            )
            if docstring:
                chunk_text += f"Docstring: {docstring}\n"
            chunk_text += f"Implementation:\n{func_code[:1200]}"
            chunks.append({
                "source": rel_path,
                "api_title": f"API: {http_verb} {route_path}",
                "endpoint": f"{http_verb} {route_path}",
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": f"{http_verb} {route_path}",
                "symbol_kind": "endpoint",
                "file_path": rel_path,
                "line_range": f"L{start_l}-L{end_l}",
                "language": "python",
                "text": chunk_text
            })

        # Function Node
        func_node = {
            "id": func_node_id,
            "label": f"{func_name}()",
            "kind": "function",
            "file_path": rel_path,
            "line_start": start_l,
            "line_end": end_l,
            "signature": signature,
            "docstring": docstring,
            "language": "python",
            "code_snippet": "\n".join(lines[start_l - 1:min(end_l, start_l + 25)])
        }
        if precision:
            func_node["precision"] = precision
        nodes.append(func_node)
        edges.append({
            "source": parent_id,
            "target": func_node_id,
            "relationship": "CONTAINS"
        })

        # Function Call edges (CALLS)
        for call_name in calls:
            if call_name and call_name != func_name:
                edges.append({
                    "source": func_node_id,
                    "target": f"func:{call_name}",
                    "relationship": "CALLS"
                })

        # Function semantic chunk (if not already added as endpoint)
        if not api_route_info and with_chunk:
            chunk_text = (
                f"[Code Symbol: function] {signature}\n"
                f"File: {rel_path} (Lines {start_l}-{end_l})\n"
            )
            if docstring:
                chunk_text += f"Docstring: {docstring}\n"
            chunk_text += f"Implementation:\n{func_code[:1200]}"
            chunks.append({
                "source": rel_path,
                "api_title": f"Function: {func_name}",
                "endpoint": signature,
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": func_name,
                "symbol_kind": "function",
                "file_path": rel_path,
                "line_range": f"L{start_l}-L{end_l}",
                "language": "python",
                "text": chunk_text
            })
        return func_node_id


    def _extract_js_ts(self, rel_path: str, content: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        chunks = []
        nodes = []
        edges = []

        file_node_id = f"file:{rel_path}"
        lines = content.splitlines()
        nodes.append({
            "id": file_node_id,
            "label": os.path.basename(rel_path),
            "kind": "file",
            "file_path": rel_path,
            "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
            "line_start": 1,
            "line_end": len(lines)
        })

        # Route matching patterns (Express / Fastify / App router)
        # Matches router.post("/login", loginAdmin), app.get("/health", (req, res) => ...), etc.
        route_pattern = re.compile(
            r'(?:app|router)\.(get|post|put|delete|patch|all)\s*\(\s*[\'"`]([^\'"`]+)[\'"`]\s*,\s*(.*?)(?=\);|\n\s*(?:app|router)\.|\n\s*module|\n\s*export|\n\s*$|\Z)',
            re.DOTALL
        )
        for m in route_pattern.finditer(content):
            verb = m.group(1).upper()
            route_path = m.group(2)
            handlers_raw = m.group(3).strip()
            ids = [w for w in re.findall(r'[a-zA-Z0-9_$]+', handlers_raw) if w not in ['async', 'req', 'res', 'next']]
            handler = ids[-1] if ids else "handler"
            line_no = content[:m.start()].count('\n') + 1
            endpoint_id = f"endpoint:{rel_path}:{verb} {route_path}"
            nodes.append({
                "id": endpoint_id,
                "label": f"{verb} {route_path}",
                "kind": "endpoint",
                "file_path": rel_path,
                "line_start": line_no,
                "line_end": line_no + 15,
                "method": verb,
                "path": route_path,
                "handler": handler,
                "signature": f"{verb} {route_path} -> {handler}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "code_snippet": "\n".join(lines[line_no - 1:min(len(lines), line_no + 15)])
            })
            edges.append({
                "source": file_node_id,
                "target": endpoint_id,
                "relationship": "ROUTES_TO"
            })
            chunk_text = (
                f"[Code Symbol: API Route] {verb} {route_path}\n"
                f"File: {rel_path} (Line {line_no})\n"
                f"Handler: {handler}\n"
                f"Snippet:\n" + "\n".join(lines[line_no - 1:min(len(lines), line_no + 20)])
            )
            chunks.append({
                "source": rel_path,
                "api_title": f"API: {verb} {route_path}",
                "endpoint": f"{verb} {route_path}",
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": f"{verb} {route_path}",
                "symbol_kind": "endpoint",
                "file_path": rel_path,
                "line_range": f"L{line_no}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "text": chunk_text
            })

        # Next.js App Router Route Handlers (export async function GET/POST)
        next_route_pattern = re.compile(
            r'export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(([^)]*)\)',
            re.MULTILINE
        )
        for m in next_route_pattern.finditer(content):
            verb = m.group(1).upper()
            line_no = content[:m.start()].count('\n') + 1
            # In Next.js, file path indicates route e.g. app/api/auth/route.ts
            route_path = "/" + rel_path.replace("\\", "/").replace("/route.ts", "").replace("/route.js", "").replace("src/app", "").replace("app", "")
            endpoint_id = f"endpoint:{rel_path}:{verb} {route_path}"
            nodes.append({
                "id": endpoint_id,
                "label": f"{verb} {route_path}",
                "kind": "endpoint",
                "file_path": rel_path,
                "line_start": line_no,
                "line_end": line_no + 20,
                "method": verb,
                "path": route_path,
                "handler": verb,
                "signature": f"export async function {verb}({m.group(2)})",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "code_snippet": "\n".join(lines[line_no - 1:min(len(lines), line_no + 20)])
            })
            edges.append({
                "source": file_node_id,
                "target": endpoint_id,
                "relationship": "ROUTES_TO"
            })
            chunk_text = (
                f"[Code Symbol: Next.js API Route] {verb} {route_path}\n"
                f"File: {rel_path} (Line {line_no})\n"
                f"Snippet:\n" + "\n".join(lines[line_no - 1:min(len(lines), line_no + 20)])
            )
            chunks.append({
                "source": rel_path,
                "api_title": f"API: {verb} {route_path}",
                "endpoint": f"{verb} {route_path}",
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": f"{verb} {route_path}",
                "symbol_kind": "endpoint",
                "file_path": rel_path,
                "line_range": f"L{line_no}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "text": chunk_text
            })

        # Function declarations and arrow functions
        func_pattern = re.compile(
            r'(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?',
            re.MULTILINE
        )
        arrow_pattern = re.compile(
            r'(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([a-zA-Z0-9_$]+))\s*=>',
            re.MULTILINE
        )

        found_funcs = set()
        for m in func_pattern.finditer(content):
            name = m.group(1)
            if name in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']:
                continue
            found_funcs.add(name)
            line_no = content[:m.start()].count('\n') + 1
            ret_type = f": {m.group(3).strip()}" if m.group(3) else ""
            sig = f"function {name}({m.group(2)}){ret_type}"
            func_id = f"func:{rel_path}:{name}"
            nodes.append({
                "id": func_id,
                "label": f"{name}()",
                "kind": "function",
                "file_path": rel_path,
                "line_start": line_no,
                "line_end": line_no + 20,
                "signature": sig,
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "code_snippet": "\n".join(lines[line_no - 1:min(len(lines), line_no + 20)])
            })
            edges.append({
                "source": file_node_id,
                "target": func_id,
                "relationship": "CONTAINS"
            })
            chunk_text = (
                f"[Code Symbol: function] {sig}\n"
                f"File: {rel_path} (Line {line_no})\n"
                f"Snippet:\n" + "\n".join(lines[line_no - 1:min(len(lines), line_no + 25)])
            )
            chunks.append({
                "source": rel_path,
                "api_title": f"Function: {name}",
                "endpoint": sig,
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": name,
                "symbol_kind": "function",
                "file_path": rel_path,
                "line_range": f"L{line_no}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "text": chunk_text
            })

        for m in arrow_pattern.finditer(content):
            name = m.group(1)
            if name in found_funcs or name in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']:
                continue
            found_funcs.add(name)
            line_no = content[:m.start()].count('\n') + 1
            params = m.group(2) or m.group(3) or ""
            sig = f"const {name} = ({params}) => ..."
            func_id = f"func:{rel_path}:{name}"
            nodes.append({
                "id": func_id,
                "label": f"{name}()",
                "kind": "function",
                "file_path": rel_path,
                "line_start": line_no,
                "line_end": line_no + 20,
                "signature": sig,
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "code_snippet": "\n".join(lines[line_no - 1:min(len(lines), line_no + 20)])
            })
            edges.append({
                "source": file_node_id,
                "target": func_id,
                "relationship": "CONTAINS"
            })
            chunk_text = (
                f"[Code Symbol: function] {sig}\n"
                f"File: {rel_path} (Line {line_no})\n"
                f"Snippet:\n" + "\n".join(lines[line_no - 1:min(len(lines), line_no + 25)])
            )
            chunks.append({
                "source": rel_path,
                "api_title": f"Function: {name}",
                "endpoint": sig,
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": name,
                "symbol_kind": "function",
                "file_path": rel_path,
                "line_range": f"L{line_no}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "text": chunk_text
            })

        # Classes and Interfaces (with ChromaDB chunks)
        class_pattern = re.compile(
            r'(?:export\s+)?(?:class|interface|type)\s+([a-zA-Z0-9_$]+)',
            re.MULTILINE
        )
        for m in class_pattern.finditer(content):
            name = m.group(1)
            line_no = content[:m.start()].count('\n') + 1
            class_id = f"class:{rel_path}:{name}"
            class_snippet = "\n".join(lines[line_no - 1:min(len(lines), line_no + 30)])
            nodes.append({
                "id": class_id,
                "label": name,
                "kind": "class",
                "file_path": rel_path,
                "line_start": line_no,
                "line_end": line_no + 30,
                "signature": f"class {name}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "code_snippet": class_snippet
            })
            edges.append({
                "source": file_node_id,
                "target": class_id,
                "relationship": "CONTAINS"
            })
            chunk_text = (
                f"[Code Symbol: Class] class {name}\n"
                f"File: {rel_path} (Line {line_no})\n"
                f"Snippet:\n{class_snippet}"
            )
            chunks.append({
                "source": rel_path,
                "api_title": f"Class: {name}",
                "endpoint": f"class {name}",
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": name,
                "symbol_kind": "class",
                "file_path": rel_path,
                "line_range": f"L{line_no}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "text": chunk_text
            })

        # High-signal file fallback if no specific symbols matched (e.g. templates, scripts, configs)
        if not chunks and content.strip():
            file_chunk_text = (
                f"[Code File: {os.path.basename(rel_path)}]\n"
                f"Path: {rel_path}\n"
                f"Content:\n{content[:1500]}"
            )
            chunks.append({
                "source": rel_path,
                "api_title": f"File: {os.path.basename(rel_path)}",
                "endpoint": os.path.basename(rel_path),
                "hash": compute_hash(file_chunk_text),
                "chunk_type": "code_file",
                "symbol_name": os.path.basename(rel_path),
                "symbol_kind": "file",
                "file_path": rel_path,
                "line_range": f"L1-L{min(len(lines), 50)}",
                "language": "typescript" if rel_path.endswith(('.ts', '.tsx')) else "javascript",
                "text": file_chunk_text
            })

        return chunks, nodes, edges

    def _extract_go(self, rel_path: str, content: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        chunks = []
        nodes = []
        edges = []

        file_node_id = f"file:{rel_path}"
        lines = content.splitlines()
        nodes.append({
            "id": file_node_id,
            "label": os.path.basename(rel_path),
            "kind": "file",
            "file_path": rel_path,
            "language": "go",
            "line_start": 1,
            "line_end": len(lines)
        })

        func_pattern = re.compile(
            r'func\s+(?:\(([^)]+)\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s*([^{]+))?',
            re.MULTILINE
        )
        for m in func_pattern.finditer(content):
            receiver = m.group(1)
            name = m.group(2)
            args = m.group(3)
            ret = m.group(4) or ""
            line_no = content[:m.start()].count('\n') + 1
            sig = f"func {f'({receiver}) ' if receiver else ''}{name}({args}) {ret}".strip()
            func_id = f"func:{rel_path}:{name}"
            nodes.append({
                "id": func_id,
                "label": f"{name}()",
                "kind": "function",
                "file_path": rel_path,
                "line_start": line_no,
                "line_end": line_no + 20,
                "signature": sig,
                "language": "go",
                "code_snippet": "\n".join(lines[line_no - 1:min(len(lines), line_no + 20)])
            })
            edges.append({
                "source": file_node_id,
                "target": func_id,
                "relationship": "CONTAINS"
            })
            chunk_text = (
                f"[Code Symbol: Go func] {sig}\n"
                f"File: {rel_path} (Line {line_no})\n"
                f"Implementation:\n" + "\n".join(lines[line_no - 1:min(len(lines), line_no + 25)])
            )
            chunks.append({
                "source": rel_path,
                "api_title": f"Go Func: {name}",
                "endpoint": sig,
                "hash": compute_hash(chunk_text),
                "chunk_type": "code_symbol",
                "symbol_name": name,
                "symbol_kind": "function",
                "file_path": rel_path,
                "line_range": f"L{line_no}",
                "language": "go",
                "text": chunk_text
            })

        return chunks, nodes, edges

    def _extract_spec_or_config(self, rel_path: str, content: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        # Handled cleanly via chunker.py for OpenAPI/Postman
        from .chunker import chunk_file_content
        chunks = chunk_file_content(content.encode('utf-8'), os.path.basename(rel_path))
        nodes = []
        edges = []

        file_node_id = f"file:{rel_path}"
        nodes.append({
            "id": file_node_id,
            "label": os.path.basename(rel_path),
            "kind": "file",
            "file_path": rel_path,
            "language": "yaml" if rel_path.endswith(('.yaml', '.yml')) else "json",
            "line_start": 1,
            "line_end": len(content.splitlines())
        })

        for c in chunks:
            ep = c.get("endpoint", "")
            if ep and (" " in ep):
                ep_id = f"endpoint:{ep}"
                nodes.append({
                    "id": ep_id,
                    "label": ep,
                    "kind": "endpoint",
                    "file_path": rel_path,
                    "signature": ep,
                    "language": "spec"
                })
                edges.append({
                    "source": file_node_id,
                    "target": ep_id,
                    "relationship": "ROUTES_TO"
                })

        return chunks, nodes, edges

    def _extract_markdown(self, rel_path: str, content: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        from .chunker import chunk_markdown_doc
        chunks = chunk_markdown_doc(content, rel_path)
        nodes = [{
            "id": f"file:{rel_path}",
            "label": os.path.basename(rel_path),
            "kind": "file",
            "file_path": rel_path,
            "language": "markdown",
            "line_start": 1,
            "line_end": len(content.splitlines())
        }]
        return chunks, nodes, []

    def index_codebase(self, files: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Indexes a batch of files: [{ 'path': '...', 'content': '...' }].
        Returns merged chunks, nodes, edges, and statistics.
        """
        all_chunks = []
        all_nodes_dict = {}
        all_edges = []
        stats = {
            "files_scanned": len(files),
            "endpoints": 0,
            "functions": 0,
            "classes": 0,
            "parse_errors": 0,
            "total_chunks": 0
        }

        for item in files:
            path = item.get("path", "")
            content = item.get("content", "")
            if not path or not content:
                continue

            chunks, nodes, edges = self.extract_file(path, content)
            all_chunks.extend(chunks)
            all_edges.extend(edges)

            for n in nodes:
                n_id = n["id"]
                if n_id not in all_nodes_dict:
                    all_nodes_dict[n_id] = n
                    kind = n.get("kind", "")
                    if kind == "endpoint":
                        stats["endpoints"] += 1
                    elif kind == "function":
                        stats["functions"] += 1
                    elif kind == "class":
                        stats["classes"] += 1
                    elif kind == "file" and n.get("parse_error"):
                        stats["parse_errors"] += 1

        stats["total_chunks"] = len(all_chunks)

        # Deduplicate edges
        dedup_edges = []
        seen_edges = set()
        for e in all_edges:
            pair = (e.get("source"), e.get("target"), e.get("relationship"))
            if pair not in seen_edges:
                seen_edges.add(pair)
                dedup_edges.append(e)

        return {
            "chunks": all_chunks,
            "graph": {
                "nodes": list(all_nodes_dict.values()),
                "edges": dedup_edges
            },
            "stats": stats
        }
