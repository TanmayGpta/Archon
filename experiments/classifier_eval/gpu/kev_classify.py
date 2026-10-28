"""Classify every module of a Python codebase with a running fine-tuned Kev server (stdlib only).
Builds the same L3 state the model was trained on (features.render): path, imports, signatures, source.

    python3 ~/archon_clf/kev_classify.py <codebase dir> [--url http://127.0.0.1:8009] [--min-conf 0.8] [-o mapping.json]

Layer descriptions come from ruleset.json next to this script (shared/fixtures/clean_architecture.json).
"""
import argparse
import ast
import json
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKIP_DIRS = {".git", ".venv", "venv", "env", "__pycache__", "node_modules", "build", "dist", ".tox", "site-packages"}
INSTRUCTIONS = ("This is one Python module from a codebase that follows Clean Architecture. "
                "Which architectural layer does the module belong to?")


def imports(tree):
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module)
    return sorted(out)


def skeleton(tree):
    """Class/function signatures, decorators and first docstring lines (mine.skeleton without masking)."""
    out = []

    def doc(node, indent):
        d = (ast.get_docstring(node) or "").strip()
        if d:
            out.append(f'{indent}    """{d.splitlines()[0][:120]}"""')

    def fn(node, indent):
        for dec in node.decorator_list:
            out.append(f"{indent}@{ast.unparse(dec)[:80]}")
        ret = f" -> {ast.unparse(node.returns)}" if node.returns else ""
        kw = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
        out.append(f"{indent}{kw} {node.name}({ast.unparse(node.args)[:160]}){ret}")
        doc(node, indent)

    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            for dec in node.decorator_list:
                out.append(f"@{ast.unparse(dec)[:80]}")
            bases = ", ".join(ast.unparse(b) for b in node.bases)
            out.append(f"class {node.name}({bases}):" if bases else f"class {node.name}:")
            doc(node, "")
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    fn(sub, "    ")
                elif isinstance(sub, ast.AnnAssign) and isinstance(sub.target, ast.Name):
                    out.append(f"    {sub.target.id}: {ast.unparse(sub.annotation)[:80]}")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            fn(node, "")
    return "\n".join(out)


def state(module, source):
    tree = ast.parse(source)
    parts = [f"module: {module}", "imports: " + (", ".join(imports(tree)[:40]) or "(none)")]
    sk = skeleton(tree)
    if sk:
        parts.append("signatures:\n" + sk[:1500])
    parts.append("source:\n" + source[:4000])
    return "\n".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--url", default="http://127.0.0.1:8009")
    ap.add_argument("--ruleset", default=str(HERE / "ruleset.json"))
    ap.add_argument("--min-conf", type=float, default=0.0, help="below this, report 'unclassified'")
    ap.add_argument("-o", "--out", help="write {module: layer} JSON here")
    args = ap.parse_args()

    criteria = {l["name"]: l["description"] for l in json.loads(Path(args.ruleset).read_text())["layers"]}
    questions = {"layer": {"type": "choice", "instructions": INSTRUCTIONS, "criteria": criteria}}
    root = Path(args.root).resolve()
    files = sorted(p for p in root.rglob("*.py")
                   if not SKIP_DIRS & set(p.relative_to(root).parts) and p.name != "__init__.py")

    mapping, t0 = {}, time.time()
    for fp in files:
        module = ".".join(fp.relative_to(root).with_suffix("").parts)
        try:
            body = json.dumps({"state": state(module, fp.read_text(encoding="utf-8", errors="replace")),
                               "model": "kev-latest", "questions": questions}).encode()
            req = urllib.request.Request(f"{args.url}/v1/systemone", body, {"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                ans = json.load(r)["answers"]["layer"]
            layer, conf = ans["choice"], float(ans.get("confidence", 0.0))
        except SyntaxError:
            layer, conf = "unclassified", 0.0
        if conf < args.min_conf:
            layer = "unclassified"
        mapping[module] = layer
        print(f"{conf:5.2f}  {layer:<15} {module}")
    print(f"{len(files)} modules in {time.time() - t0:.0f}s")
    if args.out:
        Path(args.out).write_text(json.dumps(mapping, indent=2))


if __name__ == "__main__":
    main()
