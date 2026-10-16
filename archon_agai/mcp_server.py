"""Archon Conformance MCP server (custom tool #1).

Exposes Archon's deterministic engine over MCP (stdio) so both the ADK agent and the
CrewAI crew use the same tools. Run standalone:  python -m archon_agai.mcp_server
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mcp.server.fastmcp import FastMCP  # noqa: E402

from archon_agai import engine  # noqa: E402
from archon_agai.guardrails import resolve_allowed_path  # noqa: E402
from archon_agai.schemas import AuditResult, FilePatch  # noqa: E402
from conformance.studio.blueprints import load_available_blueprints  # noqa: E402

mcp = FastMCP("archon-conformance")


def _err(e: Exception) -> dict:
    return {"error": f"{type(e).__name__}: {e}"}


@mcp.tool()
def scan_conformance(codebase_path: str, blueprint_id: str = "clean_architecture") -> dict:
    """Static AST dependency extraction + NetworkX graph + layer rules check.

    Args:
        codebase_path: Path to the Python codebase to audit.
        blueprint_id: Architecture blueprint id (e.g. 'clean_architecture', 'mvc_architecture').

    Returns: AuditResult JSON with health score, violations (file, line, snippet) and cycles.
    """
    try:
        root = resolve_allowed_path(codebase_path)
        return engine.audit(str(root), blueprint_id)[0].model_dump()
    except Exception as e:
        return _err(e)


@mcp.tool()
def detect_cycles(codebase_path: str) -> dict:
    """Tarjan strongly-connected-components cycle detection on internal modules.

    Returns: {"total_cycles": int, "cycles": [[module, ...], ...]}
    """
    try:
        root = resolve_allowed_path(codebase_path)
        res = engine.audit(str(root), "clean_architecture")[0]
        return {"total_cycles": len(res.cycles), "cycles": res.cycles}
    except Exception as e:
        return _err(e)


@mcp.tool()
def inspect_module(codebase_path: str, file_path: str, max_lines: int = 200) -> dict:
    """Read a source file of the codebase with line numbers (evidence for a fix).

    Args:
        codebase_path: Codebase root.
        file_path: File path relative to the codebase root, e.g. 'domain/fraud_checker.py'.
    """
    try:
        root = resolve_allowed_path(codebase_path)
        return {"file_path": file_path, "source": engine.read_module(str(root), file_path, max_lines)}
    except Exception as e:
        return _err(e)


@mcp.tool()
def verify_patches(codebase_path: str, blueprint_id: str, patches_json: str) -> dict:
    """Apply patches to a sandbox copy and verify: syntax, anti-gaming guardrails, re-audit, tests.

    Args:
        codebase_path: Codebase root (never modified by this tool).
        blueprint_id: Blueprint to re-check against.
        patches_json: JSON list of FilePatch objects
            [{"path": "...", "operation": "modify"|"create", "edits": [{"search": "...", "replace": "..."}],
              "content": "... (create only)", "violation_ids": [...], "rationale": "..."}]

    Returns: VerificationResult JSON (passed, health_before/after, resolved/new violations, rejections, test output).
    """
    try:
        root = resolve_allowed_path(codebase_path)
        raw = json.loads(patches_json)
        if isinstance(raw, dict):
            raw = raw.get("patches", [])
        patches = [FilePatch.model_validate(p) for p in raw]
        return engine.verify(str(root), blueprint_id, patches).model_dump()
    except Exception as e:
        return _err(e)


@mcp.tool()
def list_blueprints() -> dict:
    """List available architecture blueprints (id, name, description)."""
    return {"blueprints": [{"id": b["id"], "name": b["name"], "description": b.get("description", "")}
                           for b in load_available_blueprints()]}


if __name__ == "__main__":
    mcp.run()
