import os
import ast
import re
import hashlib
from typing import List, Dict, Any, Tuple, Optional

def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

class SCIPExtractor:
    """
    Local Sourcegraph SCIP-style Multi-Language Code Intelligence Extractor.
    Extracts high-signal symbols (Endpoints, Functions, Classes) and builds
    a deterministic Knowledge Graph (CONTAINS, ROUTES_TO, CALLS, IMPORTS)
    while stripping junk comments and boilerplate.
    """

    def __init__(self):
        # Optional tree-sitter support if installed
        self.has_treesitter = False
        try:
            import tree_sitter
            self.has_treesitter = True
        except ImportError:
            self.has_treesitter = False

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
        chunks = []
        nodes = []
        edges = []

        file_node_id = f"file:{rel_path}"
        nodes.append({
            "id": file_node_id,
            "label": os.path.basename(rel_path),
            "kind": "file",
            "file_path": rel_path,
            "language": "python",
            "line_start": 1,
            "line_end": len(content.splitlines())
        })

        try:
            tree = ast.parse(content)
        except Exception as e:
            # Syntax error in parsed file, return base file node
            return chunks, nodes, edges

        lines = content.splitlines()

        # Track top-level imports for edge creation
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                mod_name = getattr(node, 'module', None) or (node.names[0].name if node.names else "")
                if mod_name:
                    edges.append({
                        "source": file_node_id,
                        "target": f"file:{mod_name}",
                        "relationship": "IMPORTS"
                    })

        # Traverse classes and functions
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                class_node_id = f"class:{rel_path}:{node.name}"
                docstring = ast.get_docstring(node) or ""
                start_l = node.lineno
                end_l = getattr(node, 'end_lineno', start_l + 10)
                class_code = "\n".join(lines[start_l - 1:min(end_l, start_l + 30)])

                nodes.append({
                    "id": class_node_id,
                    "label": f"class {node.name}",
                    "kind": "class",
                    "file_path": rel_path,
                    "line_start": start_l,
                    "line_end": end_l,
                    "signature": f"class {node.name}",
                    "docstring": docstring,
                    "language": "python",
                    "code_snippet": class_code
                })
                edges.append({
                    "source": file_node_id,
                    "target": class_node_id,
                    "relationship": "CONTAINS"
                })

                # Class chunk
                chunk_text = f"[Code Symbol: class] class {node.name}\nFile: {rel_path} (Lines {start_l}-{end_l})\n"
                if docstring:
                    chunk_text += f"Docstring: {docstring}\n"
                chunk_text += f"Code Snippet:\n{class_code}"
                chunks.append({
                    "source": rel_path,
                    "api_title": f"Class: {node.name}",
                    "endpoint": f"class {node.name}",
                    "hash": compute_hash(chunk_text),
                    "chunk_type": "code_symbol",
                    "symbol_name": node.name,
                    "symbol_kind": "class",
                    "file_path": rel_path,
                    "line_range": f"L{start_l}-L{end_l}",
                    "language": "python",
                    "text": chunk_text
                })

                # Methods inside class
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        self._process_py_func(item, rel_path, lines, class_node_id, nodes, edges, chunks, is_method=True, class_name=node.name)

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self._process_py_func(node, rel_path, lines, file_node_id, nodes, edges, chunks, is_method=False)

        return chunks, nodes, edges

    def _process_py_func(self, node: Any, rel_path: str, lines: List[str], parent_id: str,
                          nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], chunks: List[Dict[str, Any]],
                          is_method: bool = False, class_name: str = ""):
        func_name = node.name
        start_l = node.lineno
        end_l = getattr(node, 'end_lineno', start_l + 15)
        docstring = ast.get_docstring(node) or ""

        # Construct clean signature
        is_async = isinstance(node, ast.AsyncFunctionDef)
        args_list = []
        for a in node.args.args:
            arg_str = a.arg
            if a.annotation:
                arg_str += f": {ast.unparse(a.annotation)}"
            args_list.append(arg_str)
        ret_str = f" -> {ast.unparse(node.returns)}" if node.returns else ""
        prefix = "async def " if is_async else "def "
        signature = f"{prefix}{func_name}({', '.join(args_list)}){ret_str}"

        func_code = "\n".join(lines[start_l - 1:end_l])
        func_node_id = f"func:{rel_path}:{class_name + '.' if class_name else ''}{func_name}"

        # Detect Web API Endpoints (FastAPI, Flask, Starlette decorators)
        api_route_info = None
        for dec in node.decorator_list:
            dec_text = ast.unparse(dec) if hasattr(ast, 'unparse') else ""
            route_match = re.search(r'\.(get|post|put|delete|patch|options)\s*\(\s*["\']([^"\']+)["\']', dec_text, re.IGNORECASE)
            if route_match:
                http_verb = route_match.group(1).upper()
                route_path = route_match.group(2)
                api_route_info = (http_verb, route_path)
                break

        if api_route_info:
            http_verb, route_path = api_route_info
            endpoint_id = f"endpoint:{http_verb} {route_path}"
            nodes.append({
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
            })
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
        nodes.append({
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
        })
        edges.append({
            "source": parent_id,
            "target": func_node_id,
            "relationship": "CONTAINS"
        })

        # Function Call edges (CALLS)
        for sub in ast.walk(node):
            if isinstance(sub, ast.Call):
                call_name = ""
                if isinstance(sub.func, ast.Name):
                    call_name = sub.func.id
                elif isinstance(sub.func, ast.Attribute):
                    call_name = sub.func.attr
                if call_name and call_name != func_name:
                    edges.append({
                        "source": func_node_id,
                        "target": f"func:{call_name}",
                        "relationship": "CALLS"
                    })

        # Function semantic chunk (if not already added as endpoint)
        if not api_route_info:
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
            endpoint_id = f"endpoint:{verb} {route_path}"
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
            endpoint_id = f"endpoint:{verb} {route_path}"
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
