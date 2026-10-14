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


class ClassifyRequest(BaseModel):
    modules: List[str] = Field(..., description="List of module names to classify with AI")
    blueprint_id: Optional[str] = Field("archon_architecture", description="Target blueprint")


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
            include_external=req.include_external if req.include_external is not None else True
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
