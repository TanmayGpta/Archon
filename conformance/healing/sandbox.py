"""Framework-free sandbox verification and eligibility checks for Phase 4 healing."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from conformance.healing.guardrails import check_patch_file, resolve_safe_subpath
from conformance.healing.schemas import FileDiffPreview, FilePatch, VerificationResult
from conformance.studio.service import ConformanceService, is_composition_root_file

SANDBOX_ROOT = Path(tempfile.gettempdir()) / "archon_heal_sandbox"
_SKIP_DIR_NAMES = {
    "__pycache__", ".git", ".venv", "node_modules", ".next",
    ".pytest_cache", ".mypy_cache", "conformance_sessions", "dist", "build",
}


def _ignore_sandbox_entries(src: str, names: List[str]) -> List[str]:
    """Skip cache/build folders and imported clone trees when copying into a sandbox."""
    ignored = [n for n in names if n in _SKIP_DIR_NAMES or n.endswith(".pyc")]
    if Path(src).name == "test_codebases" and "imported" in names:
        ignored.append("imported")
    return ignored


def violation_id_of(v: Dict[str, Any]) -> str:
    """Stable identifier for one architectural violation edge."""
    return f"{v['source_module']}->{v['target_module']}"


def module_to_relpath(codebase: Path, module: str) -> Optional[str]:
    """Return codebase-relative file path for an internal Python module if it exists on disk."""
    base = codebase.joinpath(*module.split("."))
    for cand in (base.with_suffix(".py"), base / "__init__.py"):
        if cand.exists():
            return cand.relative_to(codebase).as_posix()
    return None


def read_numbered_source(root: Path, rel_path: str, max_lines: int = 240) -> str:
    """Read a bounded, line-numbered source snippet confined to `root`."""
    target = resolve_safe_subpath(root, rel_path)
    lines = target.read_text(encoding="utf-8", errors="ignore").splitlines()[:max_lines]
    return "\n".join(f"{i + 1:4d}| {line}" for i, line in enumerate(lines))


def filter_eligible_violations(
    scan_dir: Path,
    audit_data: Dict[str, Any],
    mode: str,
    target_violation_id: Optional[str] = None,
    provider: Optional[str] = None,
    custom_ruleset: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    """Filter violations down to editable internal files; in 'all' mode also gate through assessor_agent."""
    violations = list(audit_data.get("violations") or [])
    nodes_by_id = {n["id"]: n for n in (audit_data.get("nodes") or [])}
    edges = audit_data.get("edges") or []

    if mode == "single":
        if not target_violation_id:
            raise ValueError("violation_id is required when mode='single'")
        violations = [v for v in violations if violation_id_of(v) == target_violation_id]
        if not violations:
            raise ValueError(f"Violation '{target_violation_id}' not found in current audit.")

    eligible: List[Dict[str, Any]] = []
    skipped: List[Dict[str, str]] = []

    for v in violations:
        vid = violation_id_of(v)
        src_node = nodes_by_id.get(v["source_module"], {})
        tgt_node = nodes_by_id.get(v["target_module"], {})
        if src_node.get("mappedBy") == "unclassified" or tgt_node.get("mappedBy") == "unclassified":
            skipped.append({"id": vid, "reason": "unclassified module"})
            continue
        if tgt_node.get("nodeType") in ("stdlib", "external"):
            skipped.append({"id": vid, "reason": f"target is {tgt_node.get('nodeType')} (not internal codebase)"})
            continue
        src_file = v.get("source_file") or module_to_relpath(scan_dir, v["source_module"])
        if not src_file or not (scan_dir / src_file).exists():
            skipped.append({"id": vid, "reason": "source file missing on disk"})
            continue
        if is_composition_root_file(resolve_safe_subpath(scan_dir, src_file), src_file):
            skipped.append({
                "id": vid,
                "reason": "startup composition root (main.py wires outer layers at runtime; heal inner module violations in domain/application/infrastructure/presentation)",
            })
            continue
        eligible.append({**v, "id": vid, "source_file": src_file})

    if mode == "all" and eligible:
        from conformance.assessor_agent import assess_violation, default_provider
        from conformance.extraction import read_module_source
        from conformance.studio.service import resolve_blueprint

        active_provider = provider or default_provider()
        if not active_provider:
            return eligible, skipped

        ruleset = resolve_blueprint(
            audit_data.get("blueprint", {}).get("id"),
            custom_ruleset or audit_data.get("customRuleset"),
        ).get("ruleset", {})
        bp_name = audit_data.get("blueprint", {}).get("name", "blueprint")
        assessed_ok: List[Dict[str, Any]] = []
        for v in eligible:
            neighbours = [
                f"{e['target']} ({e.get('targetLayer', '?')})"
                for e in edges
                if e.get("source") == v["source_module"] and e.get("target") != v["target_module"]
            ][:15]
            try:
                verdict = assess_violation(
                    violation=v,
                    ruleset=ruleset,
                    source_code=read_module_source(scan_dir, v["source_module"]),
                    target_code=read_module_source(scan_dir, v["target_module"]),
                    neighbours=neighbours,
                    blueprint_name=bp_name,
                    model_choice=active_provider,
                )
                if verdict.verdict == "fix":
                    assessed_ok.append(v)
                else:
                    skipped.append({"id": v["id"], "reason": f"assessor marked '{verdict.verdict}': {verdict.summary}"})
            except Exception as exc:
                # If assessor fails on one edge, keep it eligible rather than silently dropping everything.
                assessed_ok.append(v)
                skipped.append({"id": v["id"], "reason": f"assessor skipped check ({exc}); kept eligible"})
        eligible = assessed_ok

    return eligible, skipped


def _iter_repo_py_files(root: Path) -> List[Path]:
    return [
        p for p in sorted(root.rglob("*.py"))
        if not any(part in _SKIP_DIR_NAMES for part in p.relative_to(root).parts[:-1])
    ]


def _find_matching_path_hint(root: Path, missing_rel: str) -> Optional[str]:
    """Find an existing file matching `missing_rel`'s suffix or filename under a nested folder."""
    want_name = Path(missing_rel).name
    suffix = f"/{missing_rel}"
    by_suffix: List[str] = []
    by_name: List[str] = []
    for p in _iter_repo_py_files(root):
        rel = p.relative_to(root).as_posix()
        if rel.endswith(suffix):
            by_suffix.append(rel)
        elif p.name == want_name:
            by_name.append(rel)
    matches = by_suffix or by_name
    return ", ".join(matches[:3]) if matches else None


def apply_patches(root: Path, patches: List[FilePatch]) -> Tuple[Dict[str, Tuple[Optional[str], str]], List[str]]:
    """Apply exact search/replace edits or file creations inside `root`."""
    changes: Dict[str, Tuple[Optional[str], str]] = {}
    errors: List[str] = []
    for patch in patches:
        rel = patch.path.replace("\\", "/").lstrip("/")
        try:
            target = resolve_safe_subpath(root, rel)
        except ValueError as exc:
            errors.append(str(exc))
            continue

        if patch.operation == "create":
            before = target.read_text(encoding="utf-8") if target.exists() else None
            after = patch.content or ""
        else:
            if not target.exists():
                hint = _find_matching_path_hint(root, rel)
                if hint:
                    errors.append(f"{rel}: file does not exist (use exact path '{hint}' with operation='modify')")
                else:
                    errors.append(f"{rel}: file does not exist (use operation='create')")
                continue
            original = target.read_text(encoding="utf-8")
            before = changes[rel][0] if rel in changes else original
            after = original
            failed = False
            for edit in patch.edits:
                count = after.count(edit.search)
                if count != 1:
                    errors.append(f"{rel}: search block matched {count} times (must match once): {edit.search[:60]!r}")
                    failed = True
                    break
                after = after.replace(edit.search, edit.replace, 1)
            if failed:
                continue

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(after, encoding="utf-8")
        changes[rel] = (before, after)
    return changes, errors


def build_diff_previews(codebase_root: Path, patches: List[FilePatch]) -> List[FileDiffPreview]:
    """Compute in-memory before/after file previews without mutating `codebase_root`."""
    merged: Dict[str, Dict[str, Any]] = {}
    for patch in patches:
        rel = patch.path.replace("\\", "/").lstrip("/")
        target = resolve_safe_subpath(codebase_root, rel)
        if rel not in merged:
            before = target.read_text(encoding="utf-8") if target.exists() else ""
            merged[rel] = {
                "path": rel,
                "name": Path(rel).name,
                "operation": patch.operation if not target.exists() else "modify",
                "before": before,
                "after": before,
                "summary": patch.rationale,
            }
        state = merged[rel]
        if patch.operation == "create":
            state["after"] = patch.content or ""
        else:
            text = state["after"]
            for edit in patch.edits:
                if text.count(edit.search) == 1:
                    text = text.replace(edit.search, edit.replace, 1)
            state["after"] = text
        if patch.rationale and patch.rationale not in state["summary"]:
            state["summary"] = f"{state['summary']}; {patch.rationale}".strip("; ")
    return [FileDiffPreview(**item) for item in merged.values() if item["before"] != item["after"]]


def _run_subprocess(cmd: List[str], cwd: Path, env: Dict[str, str]) -> Tuple[int, str]:
    res = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=120)
    return res.returncode, (res.stdout + res.stderr).strip()


def _internal_package_roots(root: Path, py_files: List[Path]) -> set[str]:
    roots: set[str] = set()
    for p in py_files:
        parts = p.relative_to(root).parts
        roots.update(parts[:-1])
        if p.stem != "__init__":
            roots.add(p.stem)
    return roots


def _build_sandbox_env(root: Path) -> Dict[str, str]:
    sub_roots = [
        str(d)
        for d in sorted(root.iterdir())
        if d.is_dir()
        and d.name not in _SKIP_DIR_NAMES
        and not d.name.startswith(".")
        and d.name.lower() not in {"domain", "application", "presentation", "infrastructure", "observability", "tests", "test", "docs"}
        and any(d.rglob("*.py"))
    ]
    py_path = os.pathsep.join([str(root), *sub_roots])
    return {**os.environ, "PYTHONPATH": py_path, "PYTHONDONTWRITEBYTECODE": "1"}


def _run_import_smoke_test(root: Path) -> Tuple[bool, str]:
    py_files = [p for p in _iter_repo_py_files(root) if p.name != "main.py"]
    mods = [
        p.relative_to(root).with_suffix("").as_posix().replace("/", ".").removesuffix(".__init__")
        for p in py_files
    ]
    internal = sorted(_internal_package_roots(root, py_files))
    code = (
        "import importlib, sys\n"
        f"mods = {mods!r}\n"
        f"internal = set({internal!r})\n"
        "bad = []\n"
        "for m in mods:\n"
        "    try:\n"
        "        importlib.import_module(m)\n"
        "    except ModuleNotFoundError as e:\n"
        "        if e.name and e.name.split('.')[0] in internal:\n"
        "            bad.append(f'{m}: {e}')\n"
        "    except Exception as e:\n"
        "        bad.append(f'{m}: {type(e).__name__}: {e}')\n"
        "print('\\n'.join(bad) or 'import smoke test ok')\n"
        "sys.exit(1 if bad else 0)\n"
    )
    env = _build_sandbox_env(root)
    try:
        rc, out = _run_subprocess([sys.executable, "-c", code], root, env)
        return rc == 0, out[-2000:]
    except subprocess.TimeoutExpired:
        return False, "import smoke test timed out after 120s"


def _verify_smoke_without_regressions(root: Path, baseline_dir: Optional[Path]) -> Tuple[bool, str]:
    smoke_ok, smoke_out = _run_import_smoke_test(root)
    if smoke_ok:
        return True, smoke_out
    if baseline_dir is not None and baseline_dir.resolve() != root.resolve():
        base_ok, base_out = _run_import_smoke_test(baseline_dir)
        if not base_ok:
            base_lines = {ln.strip() for ln in base_out.splitlines() if ln.strip()}
            new_lines = [ln for ln in smoke_out.splitlines() if ln.strip() and ln.strip() not in base_lines]
            if not new_lines:
                return True, "import smoke test ok (no new regressions vs baseline)"
            return False, "\n".join(new_lines)[-2000:]
    return False, smoke_out


_MISSING_MOD_RE = re.compile(r"(?:ModuleNotFoundError|ImportError):\s+No module named ['\"]([^'\"]+)['\"]")


def run_sandbox_tests(root: Path, baseline_dir: Optional[Path] = None) -> Tuple[bool, str]:
    """Run pytest if tests exist, otherwise run an import smoke test over internal modules."""
    has_tests = any(root.rglob("test_*.py")) or (root / "tests").exists()
    if not has_tests:
        return _verify_smoke_without_regressions(root, baseline_dir)

    pytest_cmd = [sys.executable, "-m", "pytest", "-q", "-x", "--no-header", "-p", "no:cacheprovider"]
    env = _build_sandbox_env(root)
    try:
        rc, output = _run_subprocess(pytest_cmd, root, env)
    except subprocess.TimeoutExpired:
        return False, "tests timed out after 120s"

    if rc == 0:
        return True, output[-2000:]

    # External dependencies (e.g. torch) or host-only datasets missing in the container fail before our
    # patches run; fall back to internal import verification when the failure is not a patch regression.
    py_files = _iter_repo_py_files(root)
    internal = _internal_package_roots(root, py_files)
    m = _MISSING_MOD_RE.search(output)
    missing_top = m.group(1).split(".")[0] if m else None
    preexisting_env_fail = False
    if baseline_dir is not None and baseline_dir.resolve() != root.resolve():
        try:
            base_rc, base_out = _run_subprocess(pytest_cmd, baseline_dir, _build_sandbox_env(baseline_dir))
            if base_rc != 0:
                base_m = _MISSING_MOD_RE.search(base_out)
                base_missing = base_m.group(1).split(".")[0] if base_m else None
                if missing_top and missing_top not in internal:
                    preexisting_env_fail = (base_missing == missing_top)
                elif "ERROR collecting" in output and "ERROR collecting" in base_out:
                    preexisting_env_fail = True
        except subprocess.TimeoutExpired:
            pass
    elif missing_top and missing_top not in internal:
        preexisting_env_fail = True

    if preexisting_env_fail:
        smoke_ok, smoke_out = _verify_smoke_without_regressions(root, baseline_dir)
        reason = f"missing external dep '{missing_top}'" if missing_top else "pre-existing collection/env failure on baseline"
        if smoke_ok:
            return True, f"pytest skipped ({reason}); {smoke_out}"
        return False, f"{smoke_out}\n\n(after pytest failed with {reason})"[-2000:]

    return False, output[-2000:]


def verify_in_sandbox(
    codebase_dir: Path,
    blueprint_id: Optional[str],
    patches: List[FilePatch],
    baseline_audit: Dict[str, Any],
    custom_ruleset: Optional[Dict[str, Any]] = None,
    include_external: bool = True,
    target_violation_ids: Optional[List[str]] = None,
) -> VerificationResult:
    """Apply patches to an isolated temp copy, then run guardrails + re-audit + tests."""
    sandbox = SANDBOX_ROOT / uuid.uuid4().hex[:10]
    sandbox.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(codebase_dir.resolve(), sandbox, ignore=_ignore_sandbox_entries)

    try:
        changes, apply_errors = apply_patches(sandbox, patches)
        rejections = list(apply_errors)
        syntax: List[str] = []

        for rel, (before, after) in changes.items():
            for reason in check_patch_file(rel, before, after):
                (syntax if "syntax error" in reason else rejections).append(reason)

        if not syntax:
            after_audit = ConformanceService(str(sandbox)).run_audit(
                target_path=str(sandbox),
                blueprint_id=blueprint_id,
                custom_ruleset=custom_ruleset,
                include_external=include_external,
                persist_session=False,
            )
            if after_audit.get("status") != "success":
                syntax.append(f"re-audit failed: {after_audit.get('error', 'unknown error')}")
                after_audit = baseline_audit
        else:
            after_audit = baseline_audit

        ids_before = {violation_id_of(v) for v in (baseline_audit.get("violations") or [])}
        ids_after = {violation_id_of(v) for v in (after_audit.get("violations") or [])}
        tests_ok, test_out = (
            run_sandbox_tests(sandbox, baseline_dir=codebase_dir) if not syntax else (False, "skipped: syntax errors")
        )

        resolved = sorted(ids_before - ids_after)
        new_ids = sorted(ids_after - ids_before)
        targets = set(target_violation_ids or ids_before)
        targets_done = bool(targets) and targets.issubset(set(resolved)) if target_violation_ids else len(ids_after) < len(ids_before)

        score_before = float(baseline_audit.get("metrics", {}).get("healthScore", 0.0))
        score_after = float(after_audit.get("metrics", {}).get("healthScore", 0.0))

        passed = (
            not syntax
            and not rejections
            and not new_ids
            and tests_ok
            and score_after >= score_before
            and targets_done
        )

        return VerificationResult(
            passed=passed,
            health_before=score_before,
            health_after=score_after,
            violations_before=len(ids_before),
            violations_after=len(ids_after),
            resolved_violation_ids=resolved,
            new_violation_ids=new_ids,
            syntax_errors=syntax,
            guardrail_rejections=rejections,
            tests_passed=tests_ok,
            test_output=test_out,
        )
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
