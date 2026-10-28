"""Layer classification with the fine-tuned Kev-9B decision model (college GPU), Groq fallback.

Kev scores each module on its own from what the code looks like, not its name:
  precise   path + imports + signatures + source   (macro-F1 0.817 on the held-out benchmark)
  efficient path + imports + signatures           (0.787, ~1/4 of the input tokens)
One server (the L3 checkpoint) answers both; it scored the same on signature-only input as the
model trained on it. Benchmark + training: experiments/classifier_eval/README.md.

Reach the server with KEV_URL (default http://127.0.0.1:8009, e.g. an `ssh -L 8009:127.0.0.1:8009`
tunnel to the head node). If it is down, falls back to Groq on module names with GROQ_API_KEY_2
(else GROQ_API_KEY).
"""
import ast
import hashlib
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Tuple

from conformance.extraction import read_module_source

MODES = ("precise", "efficient")
INSTRUCTIONS = ("This is one Python module from a codebase that follows Clean Architecture. "
                "Which architectural layer does the module belong to?")
WORKERS = 4
_cache: Dict[Tuple[str, str, str], Tuple[str, float]] = {}   # (mode, module, source sha) -> (layer, confidence)


def kev_url() -> str:
    return os.getenv("KEV_URL", "http://127.0.0.1:8009").rstrip("/")


def kev_available(timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(f"{kev_url()}/v1/models", timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def _signatures(tree) -> str:
    """Class/function signatures, decorators and first docstring lines (training's skeleton format)."""
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


def render_state(module: str, source: str, mode: str) -> str:
    """Same layout as the training data (experiments/classifier_eval/features.render, L2 / L3)."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        tree = None
    imports = set()
    if tree is not None:
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(a.name for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module)
    parts = [f"module: {module}", "imports: " + (", ".join(sorted(imports)[:40]) or "(none)")]
    sk = _signatures(tree) if tree is not None else ""
    if sk:
        parts.append("signatures:\n" + sk[:1500])
    if mode == "precise":
        parts.append("source:\n" + source[:4000])
    return "\n".join(parts)


def _ask_kev(state: str, criteria: Dict[str, str]) -> Tuple[str, float]:
    body = json.dumps({
        "state": state, "model": "kev-latest",
        "questions": {"layer": {"type": "choice", "instructions": INSTRUCTIONS, "criteria": criteria}},
    }).encode()
    req = urllib.request.Request(f"{kev_url()}/v1/systemone", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        ans = json.load(r)["answers"]["layer"]
    return ans["choice"], float(ans.get("confidence", 0.0))


def _groq_fallback(modules: List[str], ruleset: dict, why: str):
    from conformance.classifier_agent import classify_modules_with_ruleset
    key = os.getenv("GROQ_API_KEY_2") or os.getenv("GROQ_API_KEY")
    result = classify_modules_with_ruleset(modules, ruleset, "groq", api_key=key)
    result.reasoning = f"[groq fallback: {why}] {result.reasoning}"
    return result


def classify_with_kev(modules: List[str], ruleset: dict, root_dir: Optional[str], mode: str = "precise"):
    """Returns a ModuleClassification; reasoning starts with [kev-<mode>] or [groq fallback: ...]."""
    from conformance.classifier_agent import ModuleClassification

    if mode not in MODES:
        raise ValueError(f"Kev mode must be one of {MODES}, got {mode!r}")
    if not modules:
        return ModuleClassification(mapping={}, confidence_score=1.0, reasoning=f"[kev-{mode}] nothing to classify")
    if not root_dir:
        return _groq_fallback(modules, ruleset, "no source folder given")
    if not kev_available():
        return _groq_fallback(modules, ruleset, f"Kev server not reachable at {kev_url()}")

    criteria = {l["name"]: l.get("description", l["name"]) for l in ruleset.get("layers", [])}

    def one(module):
        source = read_module_source(root_dir, module)
        if not source.strip():   # stdlib / third-party / empty file: nothing for Kev to read
            return module, ("unclassified", 0.0)
        key = (mode, module, hashlib.sha1(source.encode()).hexdigest())
        if key not in _cache:
            _cache[key] = _ask_kev(render_state(module, source, mode), criteria)
        return module, _cache[key]

    mapping, confs, failed = {}, [], []
    with ThreadPoolExecutor(WORKERS) as pool:
        for module, fut in [(m, pool.submit(one, m)) for m in modules]:
            try:
                _, (layer, conf) = fut.result()
                mapping[module] = layer
                if conf:   # skip modules with no source
                    confs.append(conf)
            except Exception:
                failed.append(module)

    reasoning = f"[kev-{mode}] Kev-9B on {len(mapping)} module(s), mean confidence {sum(confs) / max(len(confs), 1):.2f}."
    if failed:   # server dropped mid-run: finish those on Groq rather than leave them unclassified
        rest = _groq_fallback(failed, ruleset, f"Kev failed on {len(failed)} module(s)")
        mapping.update(rest.mapping)
        reasoning += f" {rest.reasoning}"
    return ModuleClassification(
        mapping=mapping,
        confidence_score=round(sum(confs) / max(len(confs), 1), 3),
        reasoning=reasoning,
    )
