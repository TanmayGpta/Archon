"""ArcGen HTTP API (mounted at /api/arcgen by app.main).

Exposes REST endpoints for:
1. Architectural pattern catalog inspection (ISO/IEC 25010)
2. Interactive Phase A ASR Elicitation (smart interview with stopping criteria)
3. Phase B Requirement-to-Architecture generation (nodes, edges, PlantUML, Mermaid, ATAM tradeoffs)
4. Loading sample pre-generated architectures and saving to workspace
"""

import os
import uuid
import json
import logging
import threading
from pathlib import Path
from typing import Callable, Dict, List, Optional, Any, Tuple
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.schemas.requirements import (
    SRSDocument,
    ArchitectureDriverDimension,
    NormalizedRequirement,
    RequirementType,
    PriorityLevel,
)
from app.schemas.architecture import ArchitectureGraph, ArchNode, ArchEdge
from app.knowledge_base.loader import PatternCatalog, get_catalog
from app.phase_a.asr_tracker import ASRTracker, DEFAULT_ASR_WEIGHTS
from app.phase_a.elicitation_agent import ElicitationAgent, QuestionItem
from app.generator import generate_architecture_from_srs
from app.phase_b.normalizer import normalize_srs
from app.llm import get_llm_client, BaseLLMClient
from app.jury.pipeline import JuryRun
from app.jury.panel import AdkJuryPanel, AdkOllamaPanel
from app.jury.models import load_rubric
from app import jobs

logger = logging.getLogger(__name__)

router = APIRouter()

EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "examples"
# Where /save-to-workspace writes: the mounted workspace in Docker, else copilot_ide/ when run natively.
def _resolve_workspace_root() -> Path:
    if os.getenv("WORKSPACE_ROOT"):
        return Path(os.getenv("WORKSPACE_ROOT"))
    if os.path.exists("/workspace"):
        return Path("/workspace")
    parents = Path(__file__).resolve().parents
    return parents[3] if len(parents) > 3 else parents[1]

WORKSPACE_ROOT = _resolve_workspace_root()

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
    jury: bool = Field(True, description="Jobs only: run the bias jury (False = plain generation)")


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
        ("FleetMonitor-IoT", EXAMPLES_DIR / "fleet_architecture.json"),
        ("ASPERA-3 APAF", EXAMPLES_DIR / "elicited_architecture.json"),
    ]

    for name, p in sample_files:
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


def _interview_status(tracker: ASRTracker, criterion_met: bool, reason: str) -> Dict[str, Any]:
    """Split the tracker's stopping criterion into 'ready' (enough to generate) and 'done' (nothing left).

    The criterion (coverage threshold / plateau / turn cap) only unlocks generation; the interview
    keeps asking about unfilled drivers so the user can still take coverage to 100%.
    """
    done = not tracker.unfilled_categories()
    ready = criterion_met or done
    if done:
        reason = "All architectural drivers captured (100% coverage)."
    elif ready:
        reason = f"{reason}. You can generate now, or keep answering to reach 100%."
    return {"should_stop": done, "ready_to_generate": ready, "stop_reason": reason}


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

        # 2. Check if the prompt alone already gives enough to generate (rare for vague prompts)
        status = _interview_status(tracker, *tracker.record_round_completion())

        # 3. Keep asking while any driver is unfilled, even once generation is unlocked
        first_q = None
        if not status["should_stop"]:
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
            **status,
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

        # Evaluate stopping criteria (unlocks generation; questions continue until 100%)
        status = _interview_status(tracker, *tracker.record_round_completion())

        next_q = None
        if not status["should_stop"]:
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
            **status,
        }
    except Exception as e:
        logger.error(f"Failed to process answer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _architecture_payload(graph, tradeoff_table, val_report) -> Dict[str, Any]:
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


def _srs_source(req: GenerateArchitectureRequest, client) -> Tuple[str, Callable[[Optional[List[str]]], SRSDocument]]:
    """What the jury compares against (raw source text) and how to (re)normalize it with findings."""
    if req.session_id and req.session_id in SESSIONS:
        session = SESSIONS[req.session_id]
        agent: ElicitationAgent = session["agent"]
        tracker: ASRTracker = session["tracker"]
        prompt: str = session["prompt"]
        answers = [f"{dim.value}: {slot.raw_response}" for dim, slot in tracker.slots.items() if slot.filled and slot.raw_response]
        raw = "\n".join([prompt] + answers)
        agent.client = client
        return raw, lambda feedback: agent.synthesize_srs(prompt, tracker, feedback=feedback)
    if req.srs_text:
        return req.srs_text, lambda feedback: normalize_srs(req.srs_text, client=client, feedback=feedback)
    raise HTTPException(
        status_code=400,
        detail="Either 'session_id' (from active elicitation) or 'srs_text' must be provided."
    )


def _project_name(req: GenerateArchitectureRequest) -> Optional[str]:
    return req.project_name if req.project_name and req.project_name != "GeneratedArchitecture" else None


@router.post("/generate")
async def generate_architecture(req: GenerateArchitectureRequest):
    """Executes Phase B architecture generation from an elicited session or raw SRS text (no jury)."""
    try:
        client = get_llm_client()
        _, normalize = _srs_source(req, client)
        srs = normalize(None)
        if not srs:
            raise HTTPException(status_code=500, detail="Failed to synthesize or normalize SRS specification.")
        if _project_name(req):
            srs.project_name = _project_name(req)

        # Execute Phase B: Pattern Matcher -> Pass 1 Nodes -> Pass 2 Edges -> Validation
        graph, tradeoff_table, val_report, _ = generate_architecture_from_srs(srs_document=srs, client=client)
        return _architecture_payload(graph, tradeoff_table, val_report)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate architecture: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _get_active_api_keys() -> Dict[str, str]:
    keys: Dict[str, str] = {}
    try:
        from app import llm_settings
        s = llm_settings.load()
        for p in llm_settings.KEY_PROVIDERS:
            val, _ = llm_settings.api_key(p, s)
            if val:
                keys[p] = val
    except Exception:
        pass
    for k in ("GROQ_API_KEY", "groq"):
        if os.getenv(k) and "groq" not in keys:
            keys["groq"] = os.getenv(k)
    for k in ("OMNIKEY_API_KEY", "omnikey", "GEMINI_API_KEY"):
        if os.getenv(k) and "omnikey" not in keys:
            keys["omnikey"] = os.getenv(k)
    return keys


def _is_cloud_selected(client: Optional[BaseLLMClient] = None) -> bool:
    try:
        from app import llm_settings
        s = llm_settings.load()
        if s.provider in ("groq", "omnikey"):
            return True
        if s.provider == "ollama":
            return False
    except Exception:
        pass

    if client is not None:
        from app.llm import GroqClient, OmniKeyClient, ResilientLLMClient, OllamaClient
        if isinstance(client, (GroqClient, OmniKeyClient)):
            return True
        if isinstance(client, ResilientLLMClient):
            active = getattr(client, "active_client", None) or (client.clients[0] if client.clients else None)
            if isinstance(active, (GroqClient, OmniKeyClient)):
                return True
            if isinstance(active, OllamaClient):
                return False

    keys = _get_active_api_keys()
    if keys.get("groq") or keys.get("omnikey"):
        return True
    return False


def _start_job(req: GenerateArchitectureRequest) -> jobs.Job:
    """Starts a generation job in a worker thread; raises 400 before anything runs on bad input."""
    client = get_llm_client()
    raw_source, normalize = _srs_source(req, client)
    job = jobs.create("jury" if req.jury else "plain")

    def work() -> None:
        try:
            if req.jury:
                is_cloud = _is_cloud_selected(client)
                api_keys = _get_active_api_keys()
                panel = AdkJuryPanel(is_cloud=is_cloud, api_keys=api_keys)
                rubric = load_rubric().for_mode(is_cloud)
                run = JuryRun(client=client, panel=panel, emit=job.emit, rubric=rubric)
                graph, table, report, _, trace = run.run(raw_source, normalize, project_name=_project_name(req))
                payload = _architecture_payload(graph, table, report)
                payload["jury"] = trace.model_dump(mode="json")
            else:
                job.emit({"type": "stage", "message": "Normalizing requirements"})
                srs = normalize(None)
                if not srs:
                    raise RuntimeError("Failed to synthesize or normalize SRS specification.")
                if _project_name(req):
                    srs.project_name = _project_name(req)
                job.emit({"type": "stage", "message": "Pattern scoring, components, connections, validation"})
                graph, table, report, _ = generate_architecture_from_srs(srs_document=srs, client=client)
                payload = _architecture_payload(graph, table, report)
            job.emit({"type": "complete", "result": payload})
        except Exception as e:  # noqa: BLE001 - surface any pipeline failure to the UI
            logger.error(f"Generation job {job.id} failed: {e}", exc_info=True)
            job.emit({"type": "error", "detail": str(e)})

    threading.Thread(target=work, name=f"arcgen-job-{job.id}", daemon=True).start()
    return job


def _sse(job: jobs.Job, start: int = 0) -> StreamingResponse:
    return StreamingResponse(jobs.follow(job, start), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/jobs")
async def start_job(req: GenerateArchitectureRequest):
    """Starts a generation (jury-judged unless jury=false) that keeps running if the page goes away.

    Follow it with GET /jobs/{job_id}/stream; re-attach any time with ?from_seq=<last seq + 1>.
    """
    job = _start_job(req)
    return job.info()


@router.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job (the ArcGen service may have restarted).")
    return job.info()


@router.get("/jobs/{job_id}/stream")
async def job_stream(job_id: str, from_seq: int = 0):
    """Server-Sent Events: stage, panel, verdict, checkpoint, iteration, complete | error. Each has "seq"."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job (the ArcGen service may have restarted).")
    return _sse(job, from_seq)


@router.post("/generate/stream")
async def generate_architecture_judged(req: GenerateArchitectureRequest):
    """Jury-judged generation streamed as Server-Sent Events (kept for callers that don't use /jobs)."""
    req.jury = True
    return _sse(_start_job(req))


@router.post("/save-to-workspace")
async def save_to_workspace(req: SaveToWorkspaceRequest):
    """Saves the generated architecture files (.json, .puml, .mmd) directly to the workspace."""
    try:
        target_dir = Path(req.target_dir) if req.target_dir else WORKSPACE_ROOT / "architecture"
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
