"""Deterministic path and AST patch guardrails for Phase 4 healing."""
import ast
import re
from pathlib import Path
from typing import Dict, List, Optional, Set

PROTECTED_FILE_PATTERNS = (
    r"(^|/)tests?/",
    r"(^|/)test_[^/]*\.py$",
    r"\.json$",
    r"(^|/)conftest\.py$",
)

SECRET_PARTS = {".env", ".git", ".ssh", "secrets"}


def resolve_safe_subpath(root: Path, rel_path: str) -> Path:
    """Resolve `rel_path` strictly inside `root`, blocking traversal and secret directories."""
    norm = rel_path.replace("\\", "/").lstrip("/")
    if not norm or ".." in Path(norm).parts:
        raise ValueError(f"{rel_path}: path traversal rejected")
    resolved_root = root.resolve()
    target = (resolved_root / norm).resolve()
    if resolved_root not in target.parents:
        raise ValueError(f"{rel_path}: path escapes codebase root")
    if any(part in SECRET_PARTS or part.startswith(".env") for part in target.parts):
        raise ValueError(f"{rel_path}: protected secret/vcs location")
    return target


def _imported_names(tree: ast.AST) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                out[(alias.asname or alias.name).split(".")[0]] = alias.name
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                out[alias.asname or alias.name] = f"{node.module or ''}.{alias.name}"
    return out


def _used_names(tree: ast.AST) -> Set[str]:
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def _code_lines(src: str) -> int:
    return sum(
        1 for line in src.splitlines()
        if line.strip() and not line.strip().startswith(("#", "import ", "from "))
    )


def _init_params(tree: ast.AST) -> Set[str]:
    out: Set[str] = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.FunctionDef) and n.name == "__init__":
            out |= {a.arg for a in n.args.args}
            for a in n.args.args:
                if a.annotation is not None:
                    out |= {x.id for x in ast.walk(a.annotation) if isinstance(x, ast.Name)}
    return out


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


def check_patch_file(rel_path: str, before: Optional[str], after: str) -> List[str]:
    """Return deterministic rejection reasons for one patched file (`before=None` for created files)."""
    reasons: List[str] = []
    norm = rel_path.replace("\\", "/")
    if ".." in Path(norm).parts or norm.startswith("/"):
        return [f"{norm}: path traversal"]
    if not norm.endswith(".py"):
        reasons.append(f"{norm}: only .py files may be patched")
    if any(re.search(pat, norm) for pat in PROTECTED_FILE_PATTERNS):
        reasons.append(f"{norm}: protected file (tests/rulesets cannot be edited by healer)")

    try:
        after_tree = ast.parse(after)
    except SyntaxError as exc:
        return reasons + [f"{norm}: syntax error line {exc.lineno}: {exc.msg}"]

    if before is None:
        return reasons

    try:
        before_tree = ast.parse(before)
    except SyntaxError:
        return reasons

    imp_before = _imported_names(before_tree)
    imp_after = _imported_names(after_tree)
    removed = set(imp_before) - set(imp_after)
    used_after = _used_names(after_tree)
    defined_after = _defined_names(after_tree)

    # Reject dangling symbols left behind when an import is deleted.
    for name in sorted(removed):
        if name in used_after and name not in defined_after:
            reasons.append(f"{norm}: removed import '{name}' is still referenced (would raise NameError)")

    # Prevent score-gaming by merely deleting an import without adding a port/adapter or injection.
    used_before = _used_names(before_tree)
    removed_used = {n for n in removed if n in used_before}
    added = set(imp_after) - set(imp_before)
    init_before = _init_params(before_tree)
    init_after = _init_params(after_tree)
    if removed_used and not added and not (removed_used & init_after) and len(init_after) <= len(init_before):
        reasons.append(
            f"{norm}: deleted import(s) {sorted(removed_used)} without introducing a port/adapter or constructor injection"
        )

    before_lines, after_lines = _code_lines(before), _code_lines(after)
    if before_lines >= 5 and after_lines < before_lines * 0.6:
        reasons.append(f"{norm}: removed {before_lines - after_lines} of {before_lines} code lines (behaviour must be preserved)")

    def _top_defs(tree: ast.AST) -> Set[str]:
        return {n.name for n in getattr(tree, "body", []) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}

    lost = _top_defs(before_tree) - _top_defs(after_tree)
    if lost:
        reasons.append(f"{norm}: removed public definitions {sorted(lost)}")

    return reasons
