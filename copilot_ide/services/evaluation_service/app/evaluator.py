import os
import time
import uuid
import json
import subprocess
import threading
import httpx
import psutil
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from .config import (
    OLLAMA_URL,
    RAG_SERVICE_URL,
    GPU_SAMPLING,
    NVIDIA_SMI_PATH,
    RESOURCE_POLL_INTERVAL
)
from .questions import QUESTION_BANK, QuestionItem
from . import corpus_loader
from . import storage
from . import metrics
from . import judge

# In-memory progress state for live status queries
ACTIVE_RUNS_STATE: Dict[str, Dict[str, Any]] = {}

def sample_resources(
    stop_event: threading.Event,
    samples: List[Dict[str, Any]],
    result_id: str,
    run_id: str,
    interval: float = RESOURCE_POLL_INTERVAL
):
    """Background thread function that samples CPU, RAM, and GPU."""
    process = psutil.Process(os.getpid())
    global GPU_SAMPLING

    while not stop_event.is_set():
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            cpu = psutil.cpu_percent(interval=None)
            ram_mb = round(process.memory_info().rss / (1024 * 1024), 2)

            gpu_util = None
            gpu_mem = None

            if GPU_SAMPLING == "nvidia-smi":
                try:
                    res = subprocess.run(
                        [
                            NVIDIA_SMI_PATH,
                            "--query-gpu=utilization.gpu,memory.used",
                            "--format=csv,noheader,nounits"
                        ],
                        capture_output=True,
                        text=True,
                        timeout=1.0
                    )
                    if res.returncode == 0 and res.stdout.strip():
                        parts = [p.strip() for p in res.stdout.strip().split(",")]
                        if len(parts) >= 2:
                            gpu_util = float(parts[0])
                            gpu_mem = float(parts[1])
                except Exception as e:
                    print(f"Evaluator: nvidia-smi failed, disabling GPU sampling: {e}")
                    GPU_SAMPLING = "none"

            sample = {
                "id": str(uuid.uuid4()),
                "result_id": result_id,
                "run_id": run_id,
                "sampled_at": now_iso,
                "cpu_percent": cpu,
                "ram_mb": ram_mb,
                "gpu_util": gpu_util,
                "gpu_mem_mb": gpu_mem
            }
            samples.append(sample)
        except Exception as e:
            print(f"Evaluator: Error during resource sampling: {e}")

        stop_event.wait(interval)

def evaluate_single_pair(
    run_id: str,
    q: QuestionItem,
    model: str,
    scoring_mode: str,
    judge_model: str,
    db_path: Optional[str] = None
):
    """Executes evaluation for a single (question, model) pair."""
    result_id = str(uuid.uuid4())
    context_id = str(uuid.uuid4())
    q_id = q["id"]
    q_text = q["question"]

    # 1. Retrieve Context from RAG Service
    bm25_valid = []
    dense_valid = []
    ce_valid = []
    context_text = ""

    try:
        with httpx.Client(timeout=45.0) as client:
            rag_resp = client.post(
                f"{RAG_SERVICE_URL}/api/search",
                json={"query": q_text, "top_k": 5}
            )
            if rag_resp.status_code == 200:
                s_data = rag_resp.json()
                bm25_raw = s_data.get("bm25", [])
                dense_raw = s_data.get("dense", [])
                ce_raw = s_data.get("cross_encoder", [])

                def is_valid(r):
                    return isinstance(r, dict) and "text" in r and r.get("score") != "N/A"

                bm25_valid = [r for r in bm25_raw if is_valid(r)]
                dense_valid = [r for r in dense_raw if is_valid(r)]
                ce_valid = [r for r in ce_raw if is_valid(r)]

                context_chunks = ce_valid[:3]
                if context_chunks:
                    context_text = "\n\n---\n\n".join([c["text"] for c in context_chunks])
            else:
                print(f"Evaluator: RAG service returned status {rag_resp.status_code}")
    except Exception as e:
        print(f"Evaluator: RAG retrieval failed for {q_id}: {e}")

    # 2. Build Prompt (exact orchestrator template)
    prompt = f"""You are an Enterprise API Copilot, an expert AI assistant specializing in API integrations, endpoint specifications, and developer code synthesis.
Answer the developer's question accurately, completely, and concisely based on the provided API documentation context below.
Provide production-ready code examples (e.g. cURL, Python, TypeScript) with correct endpoints, parameters, and headers where applicable.

### API Documentation Context:
{context_text if context_text else 'No specific API documentation found.'}

### Developer Query:
{q_text}
"""

    # 3. Start Resource Sampling
    stop_event = threading.Event()
    samples: List[Dict[str, Any]] = []
    sampler_thread = threading.Thread(
        target=sample_resources,
        args=(stop_event, samples, result_id, run_id),
        daemon=True
    )
    sampler_thread.start()

    # 4. Timed non-streaming LLM Generation
    llm_response = ""
    prompt_tokens = 0
    completion_tokens = 0
    latency_seconds = 0.0
    error_msg = None

    t_start = time.perf_counter()
    try:
        with httpx.Client(timeout=60.0) as client:
            llm_resp = client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False}
            )
            t_end = time.perf_counter()
            latency_seconds = round(t_end - t_start, 4)

            if llm_resp.status_code == 200:
                resp_json = llm_resp.json()
                llm_response = resp_json.get("response", "")
                prompt_tokens = resp_json.get("prompt_eval_count", 0)
                completion_tokens = resp_json.get("eval_count", 0)
            else:
                error_msg = f"Ollama error: HTTP {llm_resp.status_code} - {llm_resp.text}"
    except Exception as e:
        t_end = time.perf_counter()
        latency_seconds = round(t_end - t_start, 4)
        error_msg = f"LLM generation failed: {e}"
        print(f"Evaluator: Generation failed for {q_id} with {model}: {e}")
    finally:
        stop_event.set()
        sampler_thread.join(timeout=2.0)

    total_tokens = prompt_tokens + completion_tokens

    # Fallback word count if token counts missing
    if total_tokens == 0 and llm_response:
        completion_tokens = len(llm_response.split())
        prompt_tokens = len(prompt.split())
        total_tokens = prompt_tokens + completion_tokens

    # 5. Compute Metrics
    correctness_score, correctness_method = judge.score_correctness(
        question=q_text,
        llm_response=llm_response,
        expected_keywords=q["expected_keywords"],
        scoring_mode=scoring_mode,
        judge_model=judge_model,
        current_model=model
    )

    relevance_score = metrics.compute_relevance(context_text, llm_response)
    retrieval_quality = metrics.classify_retrieval(ce_valid, q["expected_sources"])
    hallucination_flag, hall_notes = metrics.detect_hallucination(llm_response, corpus_loader.get_corpus_endpoints())

    code_passed, code_notes = (
        metrics.test_code(llm_response, q_id)
        if q["is_code_question"]
        else (None, None)
    )

    (
        avg_cpu, peak_cpu, avg_ram, peak_ram,
        avg_gpu, peak_gpu, avg_gmem, peak_gmem
    ) = metrics.aggregate_samples(samples)

    retrieval_outcome = metrics.classify_retrieval_outcome(
        ce_valid, q["expected_sources"], hallucination_flag
    )

    multihop_found, multihop_complete = (
        metrics.check_multihop(ce_valid, q["expected_sources"])
        if q["exercise_6_multihop"]
        else ([], 0)
    )

    completed_at = datetime.now(timezone.utc).isoformat()

    # 6. Build Records
    result_data = {
        "id": result_id,
        "run_id": run_id,
        "question_id": q_id,
        "model": model,
        "question_text": q_text,
        "group_label": q["group"],
        "tag": q["tag"],
        "expected_sources": q["expected_sources"],
        "expected_keywords": q["expected_keywords"],
        "is_code_question": 1 if q["is_code_question"] else 0,
        "exercise_5_candidate": 1 if q["exercise_5_candidate"] else 0,
        "exercise_6_multihop": 1 if q["exercise_6_multihop"] else 0,
        "llm_response": llm_response,
        "prompt_used": prompt,
        "latency_seconds": latency_seconds,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "correctness_score": correctness_score,
        "correctness_method": correctness_method,
        "relevance_score": relevance_score,
        "retrieval_quality": retrieval_quality,
        "hallucination_flag": hallucination_flag,
        "hallucination_notes": hall_notes,
        "code_test_passed": code_passed,
        "code_test_notes": code_notes,
        "avg_cpu_percent": avg_cpu,
        "peak_cpu_percent": peak_cpu,
        "avg_ram_mb": avg_ram,
        "peak_ram_mb": peak_ram,
        "avg_gpu_util": avg_gpu,
        "peak_gpu_util": peak_gpu,
        "avg_gpu_mem_mb": avg_gmem,
        "peak_gpu_mem_mb": peak_gmem,
        "completed_at": completed_at,
        "error_msg": error_msg
    }

    context_data = {
        "id": context_id,
        "result_id": result_id,
        "run_id": run_id,
        "question_id": q_id,
        "model": model,
        "bm25_chunks": bm25_valid,
        "dense_chunks": dense_valid,
        "ce_chunks": ce_valid,
        "retrieval_outcome": retrieval_outcome,
        "context_used": context_text,
        "multihop_sources_found": multihop_found,
        "multihop_chain_complete": multihop_complete
    }

    # 7. Atomic SQLite Persistence
    storage.save_result(result_data, context_data, samples, db_path)

    # 8. Log Progress
    print(
        f"[{run_id[:8]}] {q_id:4s} {model:18s} | "
        f"correct={correctness_score:.2f} | "
        f"latency={latency_seconds:.2f}s | "
        f"tokens={total_tokens:4d} | "
        f"retrieval={retrieval_quality}"
    )

def run_evaluation_task(
    run_id: str,
    models: List[str],
    scoring_mode: str,
    judge_model: str,
    db_path: Optional[str] = None
):
    """Orchestrates sequential execution of all questions across models."""
    try:
        completed_pairs = storage.get_completed_pairs(run_id, db_path)
        total_pairs = len(QUESTION_BANK) * len(models)

        ACTIVE_RUNS_STATE[run_id] = {
            "run_id": run_id,
            "status": "running",
            "completed": len(completed_pairs),
            "total": total_pairs,
            "current_question": None,
            "current_model": None,
            "error_msg": None
        }

        # Deterministic order: Outer = Q1 -> Q26, Inner = Model 1 -> Model N
        for q in QUESTION_BANK:
            q_id = q["id"]
            for model in models:
                if (q_id, model) in completed_pairs:
                    continue

                ACTIVE_RUNS_STATE[run_id]["current_question"] = q_id
                ACTIVE_RUNS_STATE[run_id]["current_model"] = model

                try:
                    evaluate_single_pair(
                        run_id=run_id,
                        q=q,
                        model=model,
                        scoring_mode=scoring_mode,
                        judge_model=judge_model,
                        db_path=db_path
                    )
                except Exception as pair_err:
                    print(f"Evaluator error on pair ({q_id}, {model}): {pair_err}")

                completed_pairs.add((q_id, model))
                ACTIVE_RUNS_STATE[run_id]["completed"] = len(completed_pairs)

        ACTIVE_RUNS_STATE[run_id]["status"] = "completed"
        ACTIVE_RUNS_STATE[run_id]["current_question"] = None
        ACTIVE_RUNS_STATE[run_id]["current_model"] = None
        storage.update_run_status(run_id, "completed", None, db_path)
        print(f"Evaluator: Run {run_id} completed successfully.")

    except Exception as e:
        err = f"Evaluation run failed: {e}"
        print(f"Evaluator: {err}")
        if run_id in ACTIVE_RUNS_STATE:
            ACTIVE_RUNS_STATE[run_id]["status"] = "failed"
            ACTIVE_RUNS_STATE[run_id]["error_msg"] = err
        storage.update_run_status(run_id, "failed", err, db_path)
