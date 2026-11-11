import uuid
import threading
import httpx
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

from .config import (
    PORT,
    HOST,
    OLLAMA_URL,
    EVAL_MODEL_1,
    EVAL_MODEL_2,
    EVAL_MODEL_3,
    SCORING_MODE,
    JUDGE_MODEL,
    DB_PATH
)
from .questions import QUESTION_BANK
from . import corpus_loader
from . import storage
from . import evaluator
from . import ablation_runner

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    storage.init_db()
    corpus_loader.load_corpus_endpoints()
    yield

app = FastAPI(
    title="Archon Copilot Evaluation Microservice",
    version="1.0.0",
    description="Microservice for benchmarking and evaluating LLM models and RAG pipeline",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class EvaluateRunRequest(BaseModel):
    run_id: Optional[str] = None
    models: Optional[List[str]] = None
    scoring_mode: Optional[str] = Field(default=None, description="'keyword' or 'llm'")
    judge_model: Optional[str] = None

@app.get("/health")
async def health_check():
    models_avail = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models_avail = [m.get("name") for m in data.get("models", [])]
    except Exception as e:
        print(f"Health check: Could not reach Ollama: {e}")

    return {
        "status": "healthy",
        "service": "evaluation_service",
        "db_path": DB_PATH,
        "models_available": models_avail,
        "corpus_endpoints_loaded": len(corpus_loader.get_corpus_endpoints())
    }

@app.post("/api/evaluate/run")
async def start_evaluation_run(req: EvaluateRunRequest, background_tasks: BackgroundTasks):
    run_id = req.run_id

    if run_id:
        existing_run = storage.get_run(run_id)
        if existing_run:
            total = existing_run["total_questions"]
            completed = existing_run["completed"]
            if existing_run["status"] == "completed" or completed >= total:
                return {
                    "run_id": run_id,
                    "status": "already_complete",
                    "total": total,
                    "already_completed": completed,
                    "remaining": 0
                }

            # Resume run
            models = existing_run["models"]
            scoring_mode = existing_run["scoring_mode"]
            judge_model = existing_run.get("judge_model") or JUDGE_MODEL

            storage.update_run_status(run_id, "running")
            thread = threading.Thread(
                target=evaluator.run_evaluation_task,
                args=(run_id, models, scoring_mode, judge_model),
                daemon=True
            )
            thread.start()

            return {
                "run_id": run_id,
                "status": "resumed",
                "total": total,
                "already_completed": completed,
                "remaining": total - completed
            }

    # Start new run
    run_id = run_id or str(uuid.uuid4())
    models = req.models or [EVAL_MODEL_1, EVAL_MODEL_2, EVAL_MODEL_3]
    scoring_mode = req.scoring_mode or SCORING_MODE
    judge_model = req.judge_model or JUDGE_MODEL
    total_pairs = len(QUESTION_BANK) * len(models)

    storage.create_run(
        run_id=run_id,
        models=models,
        scoring_mode=scoring_mode,
        judge_model=judge_model,
        total_questions=total_pairs
    )

    thread = threading.Thread(
        target=evaluator.run_evaluation_task,
        args=(run_id, models, scoring_mode, judge_model),
        daemon=True
    )
    thread.start()

    return {
        "run_id": run_id,
        "status": "started",
        "total": total_pairs,
        "already_completed": 0,
        "remaining": total_pairs
    }

@app.get("/api/evaluate/status/{run_id}")
async def get_evaluation_status(run_id: str):
    run_row = storage.get_run(run_id)
    if not run_row:
        raise HTTPException(status_code=404, detail="Run ID not found")

    total = run_row["total_questions"]
    completed = run_row["completed"]
    percent = round((completed / total) * 100, 1) if total > 0 else 0.0

    live_state = evaluator.ACTIVE_RUNS_STATE.get(run_id, {})
    current_q = live_state.get("current_question")
    current_m = live_state.get("current_model")
    status = run_row["status"]

    return {
        "run_id": run_id,
        "status": status,
        "completed": completed,
        "total": total,
        "percent": percent,
        "current_question": current_q,
        "current_model": current_m,
        "error_msg": run_row.get("error_msg")
    }

@app.get("/api/evaluate/results/{run_id}")
async def get_evaluation_results(run_id: str):
    run_row = storage.get_run(run_id)
    if not run_row:
        raise HTTPException(status_code=404, detail="Run ID not found")

    results = storage.get_results(run_id)
    contexts = storage.get_contexts(run_id)

    return {
        "run_id": run_id,
        "status": run_row["status"],
        "results": results,
        "contexts": contexts
    }

@app.get("/api/evaluate/runs")
async def get_all_runs():
    return {"runs": storage.list_runs()}

@app.get("/api/evaluate/report/{run_id}")
async def generate_evaluation_report(run_id: str):
    run_row = storage.get_run(run_id)
    if not run_row:
        raise HTTPException(status_code=404, detail="Run ID not found")

    results = storage.get_results(run_id)
    contexts = storage.get_contexts(run_id)
    ctx_by_key = {(c["question_id"], c["model"]): c for c in contexts}

    models = run_row["models"]

    # --- Exercise 1: Model Overview ---
    ex1_models = []
    for model in models:
        m_results = [r for r in results if r["model"] == model]
        if m_results:
            avg_corr = round(sum(r["correctness_score"] or 0.0 for r in m_results) / len(m_results), 4)
            avg_lat = round(sum(r["latency_seconds"] or 0.0 for r in m_results) / len(m_results), 4)
            avg_tok = round(sum(r["total_tokens"] or 0 for r in m_results) / len(m_results), 1)
        else:
            avg_corr, avg_lat, avg_tok = 0.0, 0.0, 0.0

        ex1_models.append({
            "model": model,
            "total_questions_evaluated": len(m_results),
            "average_correctness": avg_corr,
            "average_latency_seconds": avg_lat,
            "average_tokens": avg_tok
        })

    # --- Exercise 2: Question Bank ---
    ex2_questions = QUESTION_BANK

    # --- Exercise 3: Quantitative Metrics & Aggregate Tables ---
    def calc_stats(values):
        nums = [v for v in values if v is not None]
        if not nums:
            return {"avg": None, "min": None, "max": None}
        return {
            "avg": round(sum(nums) / len(nums), 4),
            "min": round(min(nums), 4),
            "max": round(max(nums), 4)
        }

    ex3_metrics = {
        "definitions": {
            "correctness": "Fraction of expected keywords / facts present in model output (0.0 to 1.0)",
            "relevance": "Jaccard vocabulary overlap between retrieved context and LLM response (0.0 to 1.0)",
            "latency": "Wall-clock time in seconds from prompt dispatch to completion (stream=False)",
            "tokens": "Total token count reported by Ollama (prompt_eval_count + eval_count)",
            "cpu_percent": "Average process CPU utilization during generation",
            "ram_mb": "Process Resident Set Size (RSS) memory in megabytes",
            "gpu_util": "GPU utilization percentage from nvidia-smi",
            "code_pass_rate": "Fraction of code synthesis questions (Q24-Q26) passing syntax compilation & assertion checks"
        },
        "per_model_aggregates": {}
    }

    for model in models:
        m_results = [r for r in results if r["model"] == model]
        code_results = [r for r in m_results if r["is_code_question"] == 1]
        code_passed_count = sum(1 for r in code_results if r["code_test_passed"] == 1)
        code_pass_rate = round(code_passed_count / len(code_results), 4) if code_results else None

        ex3_metrics["per_model_aggregates"][model] = {
            "sample_count": len(m_results),
            "correctness": calc_stats([r["correctness_score"] for r in m_results]),
            "relevance": calc_stats([r["relevance_score"] for r in m_results]),
            "latency_seconds": calc_stats([r["latency_seconds"] for r in m_results]),
            "prompt_tokens": calc_stats([r["prompt_tokens"] for r in m_results]),
            "completion_tokens": calc_stats([r["completion_tokens"] for r in m_results]),
            "total_tokens": calc_stats([r["total_tokens"] for r in m_results]),
            "avg_cpu_percent": calc_stats([r["avg_cpu_percent"] for r in m_results]),
            "peak_cpu_percent": calc_stats([r["peak_cpu_percent"] for r in m_results]),
            "avg_ram_mb": calc_stats([r["avg_ram_mb"] for r in m_results]),
            "peak_ram_mb": calc_stats([r["peak_ram_mb"] for r in m_results]),
            "avg_gpu_util": calc_stats([r["avg_gpu_util"] for r in m_results]),
            "peak_gpu_util": calc_stats([r["peak_gpu_util"] for r in m_results]),
            "total_hallucinations": sum(1 for r in m_results if r["hallucination_flag"] == 1),
            "code_pass_rate": code_pass_rate
        }

    # --- Exercise 4: Cross-Model Comparison ---
    per_m = ex3_metrics["per_model_aggregates"]
    best_acc_model = max(models, key=lambda m: per_m.get(m, {}).get("correctness", {}).get("avg") or 0.0) if models else None
    fewest_hall_model = min(models, key=lambda m: per_m.get(m, {}).get("total_hallucinations", 999)) if models else None
    lowest_lat_model = min(models, key=lambda m: per_m.get(m, {}).get("latency_seconds", {}).get("avg") or 999.0) if models else None
    highest_code_model = max(models, key=lambda m: per_m.get(m, {}).get("code_pass_rate") or 0.0) if models else None

    ex4_comparison = {
        "best_accuracy": {
            "model": best_acc_model,
            "avg_score": per_m.get(best_acc_model, {}).get("correctness", {}).get("avg")
        },
        "fewest_hallucinations": {
            "model": fewest_hall_model,
            "count": per_m.get(fewest_hall_model, {}).get("total_hallucinations")
        },
        "highest_code_pass": {
            "model": highest_code_model,
            "rate": per_m.get(highest_code_model, {}).get("code_pass_rate")
        },
        "lowest_latency": {
            "model": lowest_lat_model,
            "avg_latency_seconds": per_m.get(lowest_lat_model, {}).get("latency_seconds", {}).get("avg")
        },
        "tradeoff_analysis": (
            "Models present distinct quality vs latency tradeoffs. General-purpose models achieve superior factual synthesis "
            "and relevance on documentation queries, whereas code-specialized models excel at structured code synthesis syntax. "
            "Smaller parameter models offer significantly reduced latency and memory footprints at the expense of multi-hop reasoning accuracy."
        )
    }

    # --- Exercise 5: Trace Chains (Candidate Questions) ---
    ex5_traces = []
    ex5_results = [r for r in results if r["exercise_5_candidate"] == 1]
    for r in ex5_results:
        key = (r["question_id"], r["model"])
        ctx = ctx_by_key.get(key, {})
        ce_chunks = ctx.get("ce_chunks", [])
        sources_found = list({c.get("source") for c in ce_chunks if c.get("source")})

        ex5_traces.append({
            "question_id": r["question_id"],
            "group": r["group_label"],
            "model": r["model"],
            "question": r["question_text"],
            "expected_sources": r["expected_sources"],
            "sources_retrieved": sources_found,
            "retrieval_outcome": ctx.get("retrieval_outcome", "unknown"),
            "retrieval_quality": r["retrieval_quality"],
            "context_injected": ctx.get("context_used", ""),
            "llm_response": r["llm_response"],
            "hallucination_flag": r["hallucination_flag"],
            "hallucination_notes": r["hallucination_notes"],
            "correctness_score": r["correctness_score"]
        })

    # --- Exercise 6: Multi-Hop Complete Chains (Q15 - Q19) ---
    ex6_multihop = []
    ex6_results = [r for r in results if r["exercise_6_multihop"] == 1]
    for r in ex6_results:
        key = (r["question_id"], r["model"])
        ctx = ctx_by_key.get(key, {})

        ex6_multihop.append({
            "question_id": r["question_id"],
            "model": r["model"],
            "question": r["question_text"],
            "expected_sources": r["expected_sources"],
            "multihop_sources_found": ctx.get("multihop_sources_found", []),
            "multihop_chain_complete": bool(ctx.get("multihop_chain_complete", 0)),
            "retrieval_quality": r["retrieval_quality"],
            "correctness_score": r["correctness_score"],
            "llm_response": r["llm_response"]
        })

    return {
        "run_id": run_id,
        "status": run_row["status"],
        "created_at": run_row["created_at"],
        "exercise_1": {"models": ex1_models},
        "exercise_2": {"question_count": len(ex2_questions), "questions": ex2_questions},
        "exercise_3": ex3_metrics,
        "exercise_4": ex4_comparison,
        "exercise_5": {"trace_count": len(ex5_traces), "traces": ex5_traces},
        "exercise_6": {"multihop_count": len(ex6_multihop), "multihop_evaluations": ex6_multihop}
    }


class AblationRunRequest(BaseModel):
    model: Optional[str] = "gemma3:4b"
    judge_model: Optional[str] = "qwen2.5:7b"


@app.post("/api/evaluate/ablation")
async def start_ablation_run(req: Optional[AblationRunRequest] = None):
    """Starts a controlled SCIP vs No-SCIP ablation study."""
    ablation_id = str(uuid.uuid4())
    model = req.model if req and req.model else "gemma3:4b"
    judge_model = req.judge_model if req and req.judge_model else "qwen2.5:7b"

    thread = threading.Thread(
        target=ablation_runner.run_full_ablation,
        args=(ablation_id, model, judge_model),
        daemon=True
    )
    thread.start()

    return {
        "ablation_id": ablation_id,
        "status": "started",
        "model": model,
        "judge_model": judge_model,
        "message": "Ablation study started in background. Monitor via /api/evaluate/ablation/status/{ablation_id}"
    }


@app.get("/api/evaluate/ablation/status/{ablation_id}")
async def get_ablation_status(ablation_id: str):
    """Returns current execution status of an ablation run."""
    run = storage.get_ablation_run(ablation_id)
    if not run:
        raise HTTPException(status_code=404, detail="Ablation run ID not found")
    return run


@app.get("/api/evaluate/ablation/report/{ablation_id}")
async def get_ablation_report_endpoint(ablation_id: str):
    """Returns the comparative ablation report with deltas."""
    run = storage.get_ablation_run(ablation_id)
    if not run:
        raise HTTPException(status_code=404, detail="Ablation run ID not found")
    if not run.get("report"):
        return {"status": run.get("status"), "message": "Report not ready yet or run in progress"}
    return run["report"]


@app.get("/api/evaluate/ablation/latest")
async def get_latest_ablation_report():
    """Returns the most recent completed ablation report."""
    runs = storage.list_ablation_runs()
    for r in runs:
        full = storage.get_ablation_run(r["id"])
        if full and full.get("report"):
            return full["report"]
    # Fallback to static file if exists
    import os
    import json
    for p in ["D:/AIDeV/ablation_report_scip.json", "D:/AIDeV/frontend/src/app/components/evaluation/ablationReportData.json"]:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    raise HTTPException(status_code=404, detail="No completed ablation report found")


@app.get("/api/evaluate/ablation/runs")
async def get_all_ablation_runs():
    return {"runs": storage.list_ablation_runs()}

