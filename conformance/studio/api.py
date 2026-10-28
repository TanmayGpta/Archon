"""FastAPI Router for Archon Conformance Studio."""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Ensure Archon root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from conformance.studio.service import ConformanceService
from conformance.studio.blueprints import load_available_blueprints, get_blueprint_by_id

router = APIRouter()
service = ConformanceService()

class AuditRequest(BaseModel):
    target_path: Optional[str] = Field(None, description="Path to codebase folder to audit")
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
    """Returns all available architecture blueprints (Clean Architecture, Archon Core, MVC, ArcGen)."""
    try:
        return {"status": "success", "blueprints": load_available_blueprints()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
