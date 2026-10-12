"""ArcGen FastAPI Router for Archon Copilot Orchestrator.

Exposes REST endpoints for:
1. Architectural pattern catalog inspection (ISO/IEC 25010)
2. Interactive Phase A ASR Elicitation (smart interview with stopping criteria)
3. Phase B Requirement-to-Architecture generation (nodes, edges, PlantUML, Mermaid, ATAM tradeoffs)
4. Loading sample pre-generated architectures and saving to workspace
"""

import os
import sys
import uuid
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Ensure /workspace or repository root is on sys.path
for candidate in [Path("/workspace"), Path(__file__).resolve().parent.parent.parent.parent]:
    if candidate.exists() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from services.arcgen.schemas.requirements import (
    SRSDocument,
    ArchitectureDriverDimension,
    NormalizedRequirement,
    RequirementType,
    PriorityLevel,
)
from services.arcgen.schemas.architecture import ArchitectureGraph, ArchNode, ArchEdge
from services.arcgen.knowledge_base.loader import PatternCatalog, get_catalog
from services.arcgen.phase_a.asr_tracker import ASRTracker, DEFAULT_ASR_WEIGHTS
from services.arcgen.phase_a.elicitation_agent import ElicitationAgent, QuestionItem
from services.arcgen.generator import generate_architecture_from_srs
from services.arcgen.phase_b.normalizer import normalize_srs
from services.arcgen.llm import get_llm_client

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory session store for multi-turn elicitation interviews
SESSIONS: Dict[str, Dict[str, Any]] = {}


# --- Request & Response Models ---
class ElicitStartRequest(BaseModel):
    prompt: str = Field(..., description="Initial software concept or requirements prompt")
    session_id: Optional[str] = Field(None, description="Optional existing session ID")


class ElicitAnswerRequest(BaseModel):
    session_id: str = Field(..., description="Active elicitation session ID")
    target_dimension: str = Field(..., description="Architecture driver dimension answering")
    answer: str = Field(..., description="User response or selected option")
    question_text: Optional[str] = Field(None, description="Question that was answered")
    skip: bool = Field(False, description="Whether the user skipped this question")


class GenerateArchitectureRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Elicitation session ID to synthesize from")
    srs_text: Optional[str] = Field(None, description="Raw SRS text if generating directly without interview")
    project_name: Optional[str] = Field("GeneratedArchitecture", description="Project name")


class SaveToWorkspaceRequest(BaseModel):
    project_name: str
    architecture: Dict[str, Any]
    target_dir: Optional[str] = None


# --- Endpoints ---

@router.get("/patterns")
async def list_patterns():
    """Returns all 20 curated ISO/IEC 25010 architectural patterns from the knowledge base."""
    try:
        catalog = get_catalog()
        patterns = catalog.list_all()
        return {
            "total": len(patterns),
            "patterns": [
                {
                    "pattern_id": p.pattern_id,
                    "name": p.name,
                    "topology_type": p.topology_type.value,
                    "role": p.pattern_role.value if hasattr(p, "pattern_role") else "MacroStyle",
                    "catalog_source": p.catalog_source,
                    "summary": p.applicability_conditions[0] if p.applicability_conditions else p.name,
                    "forces_resolved": p.forces_resolved,
                    "forces_unresolved": p.forces_unresolved,
                    "anti_requisites": p.anti_requisites,
                    "limits": {
                        "supported_consistency": p.limits.supported_consistency,
                        "min_team_size": p.limits.min_team_size,
                        "operational_complexity": p.limits.operational_complexity,
                        "cost_factor": p.limits.cost_factor,
                        "max_scale_rps": p.limits.max_scale_rps,
                    },
                }
                for p in patterns
            ],
        }
    except Exception as e:
        logger.error(f"Failed to list patterns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/examples")
async def list_examples():
    """Returns pre-generated sample architectures and templates for instant inspection."""
    samples = []
    sample_files = [
        ("FleetMonitor-IoT", Path("/workspace/services/arcgen/fleet_architecture.json")),
        ("ASPERA-3 APAF", Path("/workspace/services/arcgen/elicited_architecture.json")),
    ]

    for name, p in sample_files:
        if not p.exists():
            # Check local path fallback
            p = Path(__file__).resolve().parent.parent.parent / "arcgen" / p.name
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "mermaid" not in data or not data.get("mermaid"):
                    try:
                        g = ArchitectureGraph(**data)
                        data["mermaid"] = g.to_mermaid()
                        if "plantuml" not in data or not data.get("plantuml"):
                            data["plantuml"] = g.to_plantuml()
                    except Exception as ex:
                        logger.debug(f"Could not compute fallback diagram strings for sample {name}: {ex}")
                samples.append({
                    "id": p.stem,
                    "name": name,
                    "style": data.get("style", "Service-Based Architecture"),
                    "nodes_count": len(data.get("nodes", [])),
                    "edges_count": len(data.get("edges", [])),
                    "data": data,
                })
            except Exception as e:
                logger.warning(f"Failed loading sample {p}: {e}")

    prompt_templates = [
        {
            "id": "fleet_iot",
            "title": "IoT Fleet Telemetry & Dynamic Dispatch",
            "prompt": "Build an IoT fleet tracking and telemetry dispatch platform for 50,000 delivery vehicles streaming GPS, speed, and engine metrics every 2 seconds. Requires sub-second emergency geofence alert dispatch, driver mobile push notifications, and daily trip history analysis.",
        },
        {
            "id": "b2b_payment",
            "title": "B2B Enterprise Payment Settlement Gateway",
            "prompt": "Design an enterprise B2B payment gateway that processes bank ACH and credit card transfers with strict immediate ACID consistency, PCI-DSS audit compliance, idempotency keys, and automated reconciliation with zero balance leakage.",
        },
        {
            "id": "healthcare_telehealth",
            "title": "HIPAA-Compliant Telehealth & Records Platform",
            "prompt": "Architect a HIPAA-compliant telehealth platform for remote patient consultations, encrypted WebRTC video sessions, electronic health record (EHR) syncing, and asynchronous doctor prescription generation with multi-tenant hospital partitioning.",
        },
    ]

    return {
        "pre_generated": samples,
        "prompt_templates": prompt_templates,
    }


@router.post("/elicit/start")
async def start_elicitation(req: ElicitStartRequest):
    """Initializes an interactive ASR elicitation session from a prompt."""
    try:
        session_id = req.session_id or str(uuid.uuid4())[:8]
        tracker = ASRTracker()
        client = get_llm_client()
        agent = ElicitationAgent(client=client)

        # 1. Initial assessment of pre-stated drivers in the prompt
        extracted = agent.initial_assessment(req.prompt, tracker)

        # 2. Check if stopping condition is already satisfied (rare for vague prompts)
        should_stop, stop_reason = tracker.record_round_completion()

        # 3. Formulate first question if continuing
        first_q = None
        if not should_stop:
            first_q = agent.generate_question(tracker, req.prompt)

        # Save session state
        SESSIONS[session_id] = {
            "tracker": tracker,
            "agent": agent,
            "prompt": req.prompt,
            "current_question": first_q,
            "round": 1,
        }

        return {
            "session_id": session_id,
            "prompt": req.prompt,
            "extracted_initial_drivers": [
                {"dimension": e.dimension.value, "value": e.value, "metric": e.metric}
                for e in extracted
            ],
            "summary": tracker.get_summary(),
            "first_question": {
                "question_id": first_q.question_id,
                "target_dimension": first_q.target_dimension.value,
                "question_text": first_q.question_text,
                "why_it_matters": first_q.why_it_matters,
                "suggested_options": first_q.suggested_options,
            } if first_q else None,
            "should_stop": should_stop,
            "stop_reason": stop_reason,
        }
    except Exception as e:
        logger.error(f"Failed to start elicitation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/elicit/answer")
async def answer_elicitation(req: ElicitAnswerRequest):
    """Processes user's answer, updates ASR tracker, and returns the next question or stopping signal."""
    if req.session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail=f"Session '{req.session_id}' not found. Please start a new session.")

    session = SESSIONS[req.session_id]
    tracker: ASRTracker = session["tracker"]
    agent: ElicitationAgent = session["agent"]
    current_q: Optional[QuestionItem] = session.get("current_question")

    try:
        # Match target dimension
        target_dim = None
        for dim in ArchitectureDriverDimension:
            if dim.value.lower() == req.target_dimension.lower():
                target_dim = dim
                break

        if not target_dim:
            target_dim = ArchitectureDriverDimension.THROUGHPUT_SCALE

        # If user did not skip, process answer with agent
        if not req.skip and req.answer.strip():
            dummy_q = current_q or QuestionItem(
                question_id="Q-ANS",
                target_dimension=target_dim,
                question_text=req.question_text or f"What are your requirements for {target_dim.value}?",
                why_it_matters="",
                suggested_options=[],
            )
            agent.process_answer(dummy_q, req.answer, tracker)
        else:
            # Record explicit user skip in tracker
            tracker.record_slot(
                dimension=target_dim,
                raw_text="User skipped / Standard default acceptable",
                value="Default",
            )

        # Evaluate stopping criteria
        should_stop, stop_reason = tracker.record_round_completion()

        # Formulate next question if continuing
        next_q = None
        if not should_stop:
            next_q = agent.generate_question(tracker, session.get("prompt", ""))
            session["current_question"] = next_q
            session["round"] += 1

        return {
            "session_id": req.session_id,
            "summary": tracker.get_summary(),
            "next_question": {
                "question_id": next_q.question_id,
                "target_dimension": next_q.target_dimension.value,
                "question_text": next_q.question_text,
                "why_it_matters": next_q.why_it_matters,
                "suggested_options": next_q.suggested_options,
            } if next_q else None,
            "should_stop": should_stop,
            "stop_reason": stop_reason,
        }
    except Exception as e:
        logger.error(f"Failed to process answer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_architecture(req: GenerateArchitectureRequest):
    """Executes Phase B architecture generation from an elicited session or raw SRS text."""
    try:
        srs: Optional[SRSDocument] = None

        if req.session_id and req.session_id in SESSIONS:
            session = SESSIONS[req.session_id]
            agent: ElicitationAgent = session["agent"]
            tracker: ASRTracker = session["tracker"]
            prompt: str = session["prompt"]
            srs = agent.synthesize_srs(prompt, tracker)
        elif req.srs_text:
            srs = normalize_srs(req.srs_text)
        else:
            raise HTTPException(
                status_code=400,
                detail="Either 'session_id' (from active elicitation) or 'srs_text' must be provided."
            )

        if not srs:
            raise HTTPException(status_code=500, detail="Failed to synthesize or normalize SRS specification.")

        if req.project_name and req.project_name != "GeneratedArchitecture":
            srs.project_name = req.project_name

        # Execute Phase B: Pattern Matcher -> Pass 1 Nodes -> Pass 2 Edges -> Validation
        graph, tradeoff_table, val_report, _ = generate_architecture_from_srs(srs_document=srs)

        return {
            "project_name": graph.project_name,
            "style": graph.style,
            "nodes": [n.model_dump() for n in graph.nodes],
            "edges": [e.model_dump() for e in graph.edges],
            "plantuml": graph.plantuml or graph.to_plantuml(),
            "mermaid": graph.to_mermaid(),
            "tradeoff_table": tradeoff_table,
            "validation_report": val_report.model_dump(),
        }
    except Exception as e:
        logger.error(f"Failed to generate architecture: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-to-workspace")
async def save_to_workspace(req: SaveToWorkspaceRequest):
    """Saves the generated architecture files (.json, .puml, .mmd) directly to the workspace."""
    try:
        workspace = Path(os.getenv("WORKSPACE_ROOT", "/workspace"))
        target_dir = Path(req.target_dir) if req.target_dir else workspace / "architecture"
        target_dir.mkdir(parents=True, exist_ok=True)

        clean_name = req.project_name.lower().replace(" ", "_").replace("-", "_")
        json_file = target_dir / f"{clean_name}_architecture.json"
        puml_file = target_dir / f"{clean_name}_architecture.puml"
        mmd_file = target_dir / f"{clean_name}_architecture.mmd"

        # Write JSON
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(req.architecture, f, indent=2)

        # Write PlantUML
        puml_content = req.architecture.get("plantuml", "")
        if puml_content:
            with open(puml_file, "w", encoding="utf-8") as f:
                f.write(puml_content)

        # Write Mermaid
        mmd_content = req.architecture.get("mermaid", "")
        if mmd_content:
            with open(mmd_file, "w", encoding="utf-8") as f:
                f.write(mmd_content)

        return {
            "success": True,
            "saved_files": [
                str(json_file),
                str(puml_file) if puml_content else None,
                str(mmd_file) if mmd_content else None,
            ],
            "message": f"Saved {req.project_name} architecture to {target_dir}",
        }
    except Exception as e:
        logger.error(f"Failed to save architecture to workspace: {e}")
        raise HTTPException(status_code=500, detail=str(e))
