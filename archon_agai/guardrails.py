"""Guardrails: user-input screening, path sandboxing, tool-output validation and patch safety.

All checks are deterministic so they are cheap, testable and can't be talked around.
"""
import ast
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, ValidationError

from archon_agai.config import ALLOWED_ROOTS

# --------------------------------------------------------------------------- user prompts

_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts?)",
    r"disregard\s+(all\s+|the\s+)?(previous|prior|above|system)",
    r"forget\s+(everything|all|your)\s+(instructions|rules|you)",
    r"you\s+are\s+now\s+(a|an|in)\b",
    r"(reveal|print|show|repeat|leak)\s+(me\s+)?(your|the)\s+(system\s+prompt|instructions|api\s*key|secrets?)",
    r"\b(jailbreak|DAN mode|developer mode)\b",
    r"</?\s*(system|assistant|instructions?)\s*>",
    r"(rm\s+-rf|del\s+/[sq]|format\s+c:|os\.system|subprocess|eval\(|exec\()",
    r"(modify|edit|change|delete|rewrite)\s+(the\s+)?(ruleset|blueprint|architecture\s+rules|tests?)",
]
_TOXIC_TERMS = [
    "idiot", "stupid", "moron", "kill yourself", "kys", "retard", "shut up", "dumb ass", "f*ck", "fuck",
]


def screen_user_prompt(text: str) -> List[str]:
    """Returns reasons to block; empty list means the prompt is allowed."""
    reasons = []
    low = text.lower()
    for pat in _INJECTION_PATTERNS:
        if re.search(pat, low, flags=re.IGNORECASE):
            reasons.append(f"prompt_injection: matched /{pat}/")
    for term in _TOXIC_TERMS:
        if term in low:
            reasons.append(f"toxic_language: '{term}'")
    if len(text) > 4000:
        reasons.append("prompt_too_long: >4000 chars")
    return reasons


# --------------------------------------------------------------------------- paths

def resolve_allowed_path(p: str, base: Optional[Path] = None) -> Path:
    """Resolve a path and ensure it lies inside an allowed codebase root. Raises ValueError."""
    path = Path(p)
    if not path.is_absolute():
        path = (base or ALLOWED_ROOTS[0]) / path
    path = path.resolve()
    roots = list(ALLOWED_ROOTS) + ([base.resolve()] if base else [])
    if not any(path == r or r in path.parents for r in roots):
        raise ValueError(f"path outside allowed roots: {path}")
    return path


# --------------------------------------------------------------------------- tool outputs

def validate_tool_output(response: object, model: type[BaseModel]) -> Tuple[bool, str]:
    """Type-check a tool's return against its Pydantic contract."""
    if isinstance(response, dict) and "error" in response:
        return False, f"tool returned error: {response['error']}"
    try:
        model.model_validate(response)
        return True, ""
    except ValidationError as e:
        return False, f"schema mismatch for {model.__name__}: {e.errors()[:3]}"


# --------------------------------------------------------------------------- patches

PROTECTED_FILE_PATTERNS = [r"(^|/)tests?/", r"(^|/)test_[^/]*\.py$", r"\.json$", r"(^|/)conftest\.py$"]


def _imported_names(tree: ast.AST) -> Dict[str, str]:
    """name bound by an import -> module it came from"""
    out: Dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                out[(a.asname or a.name).split(".")[0]] = a.name
        elif isinstance(node, ast.ImportFrom):
            for a in node.names:
                out[a.asname or a.name] = f"{node.module or ''}.{a.name}"
    return out


def _used_names(tree: ast.AST) -> Set[str]:
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def _defined_names(tree: ast.AST) -> Set[str]:
    names: Set[str] = set()
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(n.name)
        elif isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            names.add(n.id)
        elif isinstance(n, ast.arg):
            names.add(n.arg)
    return names


def _code_lines(src: str) -> int:
    return sum(1 for l in src.splitlines()
               if l.strip() and not l.strip().startswith(("#", "import ", "from ")))


def check_patch_file(rel_path: str, before: Optional[str], after: str) -> List[str]:
    """Returns rejection reasons for one patched file. `before` is None for new files."""
    reasons: List[str] = []
    norm = rel_path.replace("\\", "/")
    if ".." in Path(norm).parts or norm.startswith("/"):
        return [f"{norm}: path traversal"]
    if not norm.endswith(".py"):
        reasons.append(f"{norm}: only .py files may be patched")
    if any(re.search(p, norm) for p in PROTECTED_FILE_PATTERNS):
        reasons.append(f"{norm}: protected file (tests/rulesets cannot be edited by the healer)")

    try:
        after_tree = ast.parse(after)
    except SyntaxError as e:
        return reasons + [f"{norm}: syntax error line {e.lineno}: {e.msg}"]
    if before is None:
        return reasons

    try:
        before_tree = ast.parse(before)
    except SyntaxError:
        return reasons

    imp_before, imp_after = _imported_names(before_tree), _imported_names(after_tree)
    removed = set(imp_before) - set(imp_after)
    used_after = _used_names(after_tree)
    defined_after = _defined_names(after_tree)

    # 1. Removing an import whose name is still used => NameError at runtime.
    for name in sorted(removed):
        if name in used_after and name not in defined_after:
            reasons.append(f"{norm}: removed import '{name}' but it is still referenced (would raise NameError)")

    # 2. Removing imports that were actually used, without adding any new dependency
    #    (port/adapter) and without injecting it, is the classic score-gaming move.
    used_before = _used_names(before_tree)
    removed_used = {n for n in removed if n in used_before}
    added = set(imp_after) - set(imp_before)
    init_params = _init_params(after_tree)
    if removed_used and not added and not (removed_used & init_params) and not _introduces_injection(before_tree, after_tree):
        reasons.append(
            f"{norm}: deleted import(s) {sorted(removed_used)} without introducing a port/adapter or "
            f"constructor injection (dependency inversion required, not deletion)")

    # 3. Gutting behaviour: large loss of non-import code.
    b, a = _code_lines(before), _code_lines(after)
    if b >= 5 and a < b * 0.6:
        reasons.append(f"{norm}: removed {b - a} of {b} code lines (behaviour must be preserved)")

    # 4. Public API removal: classes/functions that disappeared.
    def _top(tree):
        return {n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}
    lost = _top(before_tree) - _top(after_tree)
    if lost:
        reasons.append(f"{norm}: removed public definitions {sorted(lost)}")
    return reasons


def _init_params(tree: ast.AST) -> Set[str]:
    out: Set[str] = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.FunctionDef) and n.name == "__init__":
            out |= {a.arg for a in n.args.args}
            for a in n.args.args:  # annotation names count too: def __init__(self, repo: TxnRepo)
                if a.annotation is not None:
                    out |= {x.id for x in ast.walk(a.annotation) if isinstance(x, ast.Name)}
    return out


def _introduces_injection(before: ast.AST, after: ast.AST) -> bool:
    return len(_init_params(after)) > len(_init_params(before))
