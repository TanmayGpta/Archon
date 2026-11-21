"""FastAPI Router for Archon Conformance Studio."""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# Ensure Archon root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from conformance.studio.service import ConformanceService
from conformance.studio.session import load_latest_session, save_session
from conformance.studio.blueprints import (
    RULESET_TEMPLATE,
    RulesetError,
    delete_custom_ruleset,
    normalize_ruleset,
    save_custom_ruleset,
    scan_blueprints,
)

router = APIRouter()
service = ConformanceService()


class RulesetRequest(BaseModel):
    ruleset: Any = Field(..., description="A ruleset JSON object, or a saved ArcGen architecture to compile into one")
    name: Optional[str] = Field(None, description="Display name; defaults to the ruleset's project_name")


class AuditRequest(BaseModel):
    target_path: Optional[str] = Field(None, description="Codebase folder to audit, or a github.com URL (shallow-cloned into test_codebases/imported)")
    blueprint_id: Optional[str] = Field("archon_architecture", description="ID of architecture blueprint to check against")
    include_external: Optional[bool] = Field(True, description="Whether to include stdlib and 3rd-party library nodes")
    custom_ruleset: Optional[Dict[str, Any]] = Field(None, description="Optional custom ruleset JSON")
    classifier: Optional[str] = Field("heuristic", description="heuristic | kev-precise | kev-efficient (Groq fallback if the GPU is down)")


class ClassifyRequest(BaseModel):
    modules: List[str] = Field(..., description="List of module names to classify with AI")
    blueprint_id: Optional[str] = Field("archon_architecture", description="Target blueprint")


class AssessRequest(BaseModel):
    violation: Dict[str, Any] = Field(..., description="A violation object from a previous /audit response")
    neighbours: List[str] = Field(default_factory=list, description="Other dependencies of the source module, e.g. 'shop.db (Infrastructure)'")
    target_path: Optional[str] = Field(None, description="Codebase folder the audit ran on")
    blueprint_id: Optional[str] = Field("archon_architecture", description="Blueprint the audit was judged against")
    custom_ruleset: Optional[Dict[str, Any]] = Field(None, description="Custom ruleset used by the audit, if any")
    provider: Optional[str] = Field(None, description="groq | gemini | nvidia | openai; default = first key found")


@router.post("/assess")
def assess_violation(req: AssessRequest):
    """LLM verdict on one flagged dependency, including what the code does better than the blueprint."""
    try:
        return service.assess_violation(
            violation=req.violation,
            neighbours=req.neighbours,
            target_path=req.target_path,
            blueprint_id=req.blueprint_id,
            custom_ruleset=req.custom_ruleset,
            provider=req.provider,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Assessment failed: {str(e)}")


def _kev_agent(method: str, path: str) -> Dict[str, Any]:
    """Forward to the kev-agent service (copilot_ide/services/kev_agent), which owns the GPU pod + tunnel."""
    import json
    import urllib.request
    base = os.getenv("KEV_AGENT_URL", "http://host.docker.internal:7338").rstrip("/")
    try:
        req = urllib.request.Request(f"{base}{path}", data=b"" if method == "POST" else None, method=method)
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as e:
        return {"agent": False, "phase": "no agent", "error": str(e),
                "hint": "Start it with COMPOSE_PROFILES=gpu (plus CLF_HOST, KEV_SSH_DIR) in copilot_ide/.env, then docker compose up -d."}


@router.get("/gpu/status")
def gpu_status():
    """Kev GPU state: off | pod starting | loading model | connecting | ready."""
    return _kev_agent("GET", "/status")


@router.post("/gpu/start")
def gpu_start():
    """One click: create the pod, load Kev-9B, open the tunnel (returns at once; poll /gpu/status)."""
    return _kev_agent("POST", "/start")


@router.post("/gpu/stop")
def gpu_stop():
    """Delete the pod and free the GPU slice."""
    return _kev_agent("POST", "/stop")


@router.get("/classifier-status")
def classifier_status():
    """Whether the Kev GPU server answers (else kev-* audits fall back to Groq)."""
    from conformance.kev_classifier import kev_available, kev_url
    return {"kevUrl": kev_url(), "kevUp": kev_available()}


@router.get("/blueprints")
def list_blueprints():
    """All usable blueprints (built-in, ArcGen-generated, imported) plus any ruleset files that were skipped."""
    try:
        blueprints, issues = scan_blueprints()
        return {"status": "success", "blueprints": blueprints, "issues": issues}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rulesets/template")
def ruleset_template():
    """A starter ruleset to edit and import."""
    return JSONResponse(RULESET_TEMPLATE, headers={"Content-Disposition": 'attachment; filename="ruleset_template.json"'})


@router.post("/rulesets/validate")
def validate_imported_ruleset(req: RulesetRequest):
    """Checks a ruleset (or an ArcGen architecture file) without saving it."""
    try:
        ruleset = normalize_ruleset(req.ruleset)
    except RulesetError as e:
        return {"valid": False, "errors": e.errors}
    return {"valid": True, "errors": [], "name": ruleset["project_name"],
            "layers": [l["name"] for l in ruleset["layers"]], "rules": len(ruleset["rules"])}


@router.post("/rulesets")
def import_ruleset(req: RulesetRequest):
    """Validates and stores a ruleset so it appears in the blueprint list. Same name replaces the old one."""
    try:
        return {"status": "success", **save_custom_ruleset(req.ruleset, req.name)}
    except RulesetError as e:
        raise HTTPException(status_code=422, detail={"message": "The ruleset is not valid.", "errors": e.errors})
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not save the ruleset: {e}")


@router.delete("/rulesets/{blueprint_id}")
def remove_ruleset(blueprint_id: str):
    """Deletes an imported ruleset (built-in and ArcGen blueprints are not deletable)."""
    if not delete_custom_ruleset(blueprint_id):
        raise HTTPException(status_code=404, detail=f"No imported ruleset with id '{blueprint_id}'.")
    return {"status": "success", "deleted": blueprint_id}


@router.get("/session")
def get_session():
    """Returns the latest audit session record so Conformance Studio and IDE share the exact same state."""
    session = load_latest_session()
    if not session:
        return {"status": "none", "session": None}
    return {"status": "success", "session": session}


@router.post("/audit")
def audit_codebase(req: AuditRequest):
    """Executes a full static dependency audit and conformance check."""
    try:
        result = service.run_audit(
            target_path=req.target_path,
            blueprint_id=req.blueprint_id,
            custom_ruleset=req.custom_ruleset,
            include_external=req.include_external if req.include_external is not None else True,
            classifier=req.classifier or "heuristic"
        )
        return result
    except RulesetError as e:
        raise HTTPException(status_code=422, detail={"message": "The custom ruleset is not valid.", "errors": e.errors})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audit failed: {str(e)}")


@router.get("/workspace-info")
def get_workspace_info():
    """Returns workspace root and standard preset targets."""
    return {
        "workspaceRoot": str(ROOT_DIR),
        "presets": [
            {
                "id": "archon_self",
                "name": "Archon Core System (100% Conforming)",
                "path": str(ROOT_DIR),
                "blueprintId": "archon_architecture",
                "description": "Production Archon architecture verified against multi-layer rules."
            },
            {
                "id": "clean_arch",
                "name": "Clean Architecture Standard",
                "path": str(ROOT_DIR),
                "blueprintId": "clean_architecture",
                "description": "Strict Onion/Hexagonal Clean Architecture ruleset."
            },
            {
                "id": "mvc_arch",
                "name": "MVC 3-Tier Pattern",
                "path": str(ROOT_DIR),
                "blueprintId": "mvc_architecture",
                "description": "Model-View-Controller strict separation of concerns."
            }
        ]
    }


# ── Phase 4: LangGraph Architectural Healing (IDE only) ──────────────────────

class HealDecisionRequest(BaseModel):
    approved: bool
    applied_files: List[str] = Field(default_factory=list)


@router.post("/heal/jobs")
def start_heal(req: Dict[str, Any]):
    """Start a background LangGraph healing job; lazy-imports langgraph so audits never break if absent."""
    try:
        import langgraph  # noqa: F401
        from conformance.healing.jobs import start_heal_job
        from conformance.healing.schemas import HealJobRequest
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Healing engine unavailable ({e}). Rebuild orchestrator-service to install langgraph.",
        )
    try:
        parsed = HealJobRequest.model_validate(req)
        job = start_heal_job(parsed)
        return {"status": "started", "job_id": job.id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/heal/jobs/{job_id}")
def get_heal_status(job_id: str):
    """Return current status and verified diff previews for a healing job."""
    from conformance.healing.jobs import get_heal_job
    job = get_heal_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Heal job '{job_id}' not found")
    return job.info()


@router.get("/heal/jobs/{job_id}/stream")
async def stream_heal_job(job_id: str, start: int = 0):
    """Stream SSE events from a healing job (supports resuming from `start` seq index)."""
    from conformance.healing.jobs import follow_heal_job, get_heal_job
    job = get_heal_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Heal job '{job_id}' not found")
    return StreamingResponse(follow_heal_job(job, start=start), media_type="text/event-stream")


@router.post("/heal/jobs/{job_id}/decision")
def decide_heal_job(job_id: str, req: HealDecisionRequest):
    """Record approval or rejection on the paused LangGraph healing job."""
    from conformance.healing.jobs import resolve_heal_job
    try:
        return resolve_heal_job(job_id, approved=req.approved, applied_files=req.applied_files)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
