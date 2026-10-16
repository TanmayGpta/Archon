"""Deterministic ground truth: wraps Archon's conformance engine (no LLM, no agent framework).

Used by the MCP server (tools for both frameworks) and by the gateway for the canvas.
"""
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from archon_agai.config import RUNS_DIR
from archon_agai.guardrails import check_patch_file
from archon_agai.schemas import AuditMetrics, AuditResult, FilePatch, VerificationResult, Violation
from conformance.studio.service import ConformanceService

_IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".git", ".venv", "node_modules")


def module_to_path(codebase: Path, module: str) -> Optional[str]:
    base = codebase.joinpath(*module.split("."))
    for cand in (base.with_suffix(".py"), base / "__init__.py"):
        if cand.exists():
            return cand.relative_to(codebase).as_posix()
    return None


def audit(codebase: str, blueprint_id: str) -> Tuple[AuditResult, Dict]:
    """Returns (structured result, raw studio payload for the canvas)."""
    raw = ConformanceService().run_audit(target_path=codebase, blueprint_id=blueprint_id, include_external=True)
    if raw.get("status") != "success":
        raise ValueError(raw.get("error", "audit failed"))
    root = Path(raw["targetPath"])
    violations = [
        Violation(
            id=f"{v['source_module']}->{v['target_module']}",
            file_path=module_to_path(root, v["source_module"]),
            **v,
        )
        for v in raw["violations"]
    ]
    m = raw["metrics"]
    result = AuditResult(
        codebase=str(root),
        blueprint_id=blueprint_id,
        metrics=AuditMetrics(health_score=m["healthScore"], total_edges_checked=m["totalDependencies"],
                             total_violations=m["totalViolations"], total_cycles=m["cyclesCount"]),
        violations=violations,
        cycles=raw["cycles"],
    )
    return result, raw


def read_module(codebase: str, rel_path: str, max_lines: int = 200) -> str:
    root = Path(codebase).resolve()
    path = (root / rel_path).resolve()
    if root not in path.parents:
        raise ValueError("path outside codebase")
    lines = path.read_text(encoding="utf-8").splitlines()[:max_lines]
    return "\n".join(f"{i + 1:4d}| {l}" for i, l in enumerate(lines))


def apply_patches(root: Path, patches: List[FilePatch]) -> Tuple[Dict[str, Tuple[Optional[str], str]], List[str]]:
    """Apply search/replace patches in place under `root`. Returns ({path: (before, after)}, errors)."""
    changes: Dict[str, Tuple[Optional[str], str]] = {}
    errors: List[str] = []
    for p in patches:
        rel = p.path.replace("\\", "/").lstrip("/")
        target = (root / rel).resolve()
        if root.resolve() not in target.parents:
            errors.append(f"{rel}: outside codebase")
            continue
        if p.operation == "create":
            before = target.read_text(encoding="utf-8") if target.exists() else None
            after = p.content or ""
        else:
            if not target.exists():
                errors.append(f"{rel}: file does not exist (use operation='create')")
                continue
            before = changes[rel][0] if rel in changes else target.read_text(encoding="utf-8")
            after = target.read_text(encoding="utf-8")
            for e in p.edits:
                count = after.count(e.search)
                if count != 1:
                    errors.append(f"{rel}: search text found {count} times (must be exactly 1): {e.search[:60]!r}")
                    continue
                after = after.replace(e.search, e.replace, 1)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(after, encoding="utf-8")
        changes[rel] = (changes[rel][0] if rel in changes else before, after)
    return changes, errors


def _run_tests(root: Path) -> Tuple[bool, str]:
    """pytest if the codebase has tests, otherwise an import smoke test of every module."""
    env = {**os.environ, "PYTHONPATH": str(root), "PYTHONDONTWRITEBYTECODE": "1"}
    has_tests = any(root.rglob("test_*.py")) or (root / "tests").exists()
    if has_tests:
        cmd = [sys.executable, "-m", "pytest", "-q", "-x", "--no-header", "-p", "no:cacheprovider"]
    else:
        # Missing third-party libs are tolerated; broken internal imports are not.
        mods = [p.relative_to(root).with_suffix("").as_posix().replace("/", ".").removesuffix(".__init__")
                for p in root.rglob("*.py") if p.name != "main.py"]
        internal = sorted({m.split(".")[0] for m in mods})
        code = f"""
import importlib, sys
bad = []
for m in {mods!r}:
    try:
        importlib.import_module(m)
    except ModuleNotFoundError as e:
        if e.name and e.name.split('.')[0] in {internal!r}:
            bad.append(f'{{m}}: {{e}}')
    except Exception as e:
        bad.append(f'{{m}}: {{type(e).__name__}}: {{e}}')
print('\\n'.join(bad) or 'import smoke test ok')
sys.exit(1 if bad else 0)
"""
        cmd = [sys.executable, "-c", code]
    try:
        r = subprocess.run(cmd, cwd=root, env=env, capture_output=True, text=True, timeout=120)
        out = (r.stdout + r.stderr).strip()
        return r.returncode == 0, out[-2000:]
    except subprocess.TimeoutExpired:
        return False, "tests timed out after 120s"


def verify(codebase: str, blueprint_id: str, patches: List[FilePatch],
           baseline: Optional[AuditResult] = None) -> VerificationResult:
    """Apply patches to a fresh sandbox copy, then guardrails + re-audit + tests."""
    src = Path(codebase).resolve()
    baseline = baseline or audit(str(src), blueprint_id)[0]
    sandbox = RUNS_DIR / "sandbox" / uuid.uuid4().hex[:10]
    shutil.copytree(src, sandbox, ignore=_IGNORE)
    try:
        changes, apply_errors = apply_patches(sandbox, patches)
        rejections = list(apply_errors)
        syntax = []
        for rel, (before, after) in changes.items():
            for reason in check_patch_file(rel, before, after):
                (syntax if "syntax error" in reason else rejections).append(reason)

        after_audit = audit(str(sandbox), blueprint_id)[0] if not syntax else baseline
        ids_before = {v.id for v in baseline.violations}
        ids_after = {v.id for v in after_audit.violations}
        tests_ok, test_out = _run_tests(sandbox) if not syntax else (False, "skipped: syntax errors")

        new_ids = sorted(ids_after - ids_before)
        passed = (not syntax and not rejections and not new_ids and tests_ok
                  and after_audit.metrics.health_score >= baseline.metrics.health_score
                  and len(ids_after) < len(ids_before))
        return VerificationResult(
            passed=passed,
            health_before=baseline.metrics.health_score,
            health_after=after_audit.metrics.health_score,
            violations_before=len(ids_before),
            violations_after=len(ids_after),
            resolved_violation_ids=sorted(ids_before - ids_after),
            new_violation_ids=new_ids,
            syntax_errors=syntax,
            guardrail_rejections=rejections,
            tests_passed=tests_ok,
            test_output=test_out,
        )
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
