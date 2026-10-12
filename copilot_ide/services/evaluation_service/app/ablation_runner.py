"""Ablation Runner: Controlled Benchmark of SCIP Code Intelligence vs Baseline.

Phase 1: Clear SCIP code chunks -> Run Baseline Evaluation (No-SCIP)
Phase 2: Re-index Codebase via SCIP -> Run Treatment Evaluation (With-SCIP)
Phase 3: Calculate Metrics Deltas & Generate Comparative Report
"""

import os
import time
import uuid
import json
import httpx
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from .config import OLLAMA_URL, RAG_SERVICE_URL, JUDGE_MODEL
from .codebase_questions import CODEBASE_QUESTION_BANK
from . import storage
from . import judge
from . import metrics

ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://orchestrator-service:8000")

def evaluate_ablation_item(
    run_id: str,
    q: Dict[str, Any],
    model: str,
    variant: str,
    scoring_mode: str = "llm",
    judge_model: str = "qwen2.5:7b",
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """Evaluates a single codebase question for a given ablation variant (baseline / with_scip)."""
    result_id = str(uuid.uuid4())
    context_id = str(uuid.uuid4())
    q_id = q["id"]
    q_text = q["question"]

    # 1. Retrieve Context from RAG Service with latency tracking
    t_rag_start = time.perf_counter()
    bm25_valid = []
    dense_valid = []
    ce_valid = []
    context_text = ""
    scip_count_top3 = 0

    try:
        with httpx.Client(timeout=45.0) as client:
            rag_resp = client.post(
                f"{RAG_SERVICE_URL}/api/search",
                json={"query": q_text, "top_k": 5}
            )
            t_rag_end = time.perf_counter()
            rag_latency = round(t_rag_end - t_rag_start, 4)

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
                    for c in context_chunks:
                        if c.get("chunk_type") in ["code_symbol", "code_file"] or any(
                            (c.get("source") or "").startswith(p) for p in ["src/", "backend/", "frontend/"]
                        ):
                            scip_count_top3 += 1
            else:
                rag_latency = round(time.perf_counter() - t_rag_start, 4)
    except Exception as e:
        rag_latency = round(time.perf_counter() - t_rag_start, 4)
        print(f"Ablation: RAG retrieval failed for {q_id} ({variant}): {e}")

    # 2. Build Standard Copilot Prompt
    prompt = f"""You are an Enterprise API Copilot, an expert AI assistant specializing in API integrations, endpoint specifications, and developer code synthesis.
Answer the developer's question accurately, completely, and concisely based on the provided API documentation context below.
Provide production-ready code examples (e.g. cURL, Python, TypeScript) with correct endpoints, parameters, and headers where applicable.

### API Documentation Context:
{context_text if context_text else 'No specific API documentation found.'}

### Developer Query:
{q_text}
"""

    # 3. Timed Non-Streaming LLM Generation
    llm_response = ""
    prompt_tokens = 0
    completion_tokens = 0
    latency_seconds = 0.0
    error_msg = None

    t_start = time.perf_counter()
    try:
        with httpx.Client(timeout=75.0) as client:
            llm_resp = client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False}
            )
            latency_seconds = round(time.perf_counter() - t_start, 4)

            if llm_resp.status_code == 200:
                resp_json = llm_resp.json()
                llm_response = resp_json.get("response", "")
                prompt_tokens = resp_json.get("prompt_eval_count", 0)
                completion_tokens = resp_json.get("eval_count", 0)
            else:
                error_msg = f"Ollama HTTP {llm_resp.status_code}"
    except Exception as e:
        latency_seconds = round(time.perf_counter() - t_start, 4)
        error_msg = f"LLM error: {e}"

    total_tokens = prompt_tokens + completion_tokens
    if total_tokens == 0 and llm_response:
        completion_tokens = len(llm_response.split())
        prompt_tokens = len(prompt.split())
        total_tokens = prompt_tokens + completion_tokens

    # 4. Compute Metrics
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

    # 5. Persist to SQLite
    completed_at = datetime.now(timezone.utc).isoformat()
    result_data = {
        "id": result_id,
        "run_id": run_id,
        "question_id": q_id,
        "model": model,
        "question_text": q_text,
        "group_label": q["category"],
        "tag": q["tag"],
        "expected_sources": q["expected_sources"],
        "expected_keywords": q["expected_keywords"],
        "is_code_question": 0,
        "exercise_5_candidate": 0,
        "exercise_6_multihop": 0,
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
        "hallucination_flag": 0,
        "hallucination_notes": "",
        "code_test_passed": None,
        "code_test_notes": None,
        "avg_cpu_percent": None,
        "peak_cpu_percent": None,
        "avg_ram_mb": None,
        "peak_ram_mb": None,
        "avg_gpu_util": None,
        "peak_gpu_util": None,
        "avg_gpu_mem_mb": None,
        "peak_gpu_mem_mb": None,
        "rag_latency_seconds": rag_latency,
        "context_char_count": len(context_text),
        "scip_chunks_in_top3": scip_count_top3,
        "ablation_variant": variant,
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
        "retrieval_outcome": "relevant" if retrieval_quality == "correct" else "irrelevant",
        "context_used": context_text,
        "multihop_sources_found": [],
        "multihop_chain_complete": 0
    }

    storage.save_result(result_data, context_data, [], db_path)

    print(
        f"[{variant.upper():10s}] {q_id:4s} | "
        f"correct={correctness_score:.2f} | "
        f"latency={latency_seconds:.2f}s | "
        f"p_tokens={prompt_tokens:4d} | "
        f"c_tokens={completion_tokens:4d} | "
        f"retrieval={retrieval_quality}"
    )

    return result_data


def run_full_ablation(
    ablation_id: str,
    model: str = "gemma3:4b",
    judge_model: str = "qwen2.5:7b",
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes the complete 3-phase ablation benchmark:
    Phase 1: Baseline (No-SCIP)
    Phase 2: Treatment (With-SCIP)
    Phase 3: Analysis & Report Generation
    """
    storage.init_db(db_path)
    storage.create_ablation_run(ablation_id, model=model, status="running", db_path=db_path)

    baseline_run_id = f"ablation-base-{ablation_id[:8]}"
    scip_run_id = f"ablation-scip-{ablation_id[:8]}"

    try:
        # ══════════════════════════════════════════════════════════════
        # PHASE 1: Baseline (No-SCIP)
        # ══════════════════════════════════════════════════════════════
        print("\n" + "=" * 70)
        print(">>> ABLATION PHASE 1: CLEARING SCIP CHUNKS (BASELINE NO-SCIP)...")
        print("=" * 70)

        with httpx.Client(timeout=30.0) as client:
            clear_resp = client.post(f"{RAG_SERVICE_URL}/api/database/clear-scip-chunks")
            print(f"RAG clear response: {clear_resp.json()}")

            stats_resp = client.get(f"{RAG_SERVICE_URL}/api/database/chunk-stats")
            stats_data = stats_resp.json()
            print(f"RAG stats before baseline run: {stats_data}")

        storage.create_run(
            run_id=baseline_run_id,
            models=[model],
            scoring_mode="llm",
            judge_model=judge_model,
            total_questions=len(CODEBASE_QUESTION_BANK),
            db_path=db_path
        )

        baseline_results = []
        for q in CODEBASE_QUESTION_BANK:
            r = evaluate_ablation_item(
                run_id=baseline_run_id,
                q=q,
                model=model,
                variant="baseline",
                scoring_mode="llm",
                judge_model=judge_model,
                db_path=db_path
            )
            baseline_results.append(r)

        storage.update_run_status(baseline_run_id, "completed", None, db_path)

        # ══════════════════════════════════════════════════════════════
        # PHASE 2: Treatment (With-SCIP)
        # ══════════════════════════════════════════════════════════════
        print("\n" + "=" * 70)
        print(">>> ABLATION PHASE 2: RE-INDEXING TEDXBMU WITH SCIP (WITH-SCIP)...")
        print("=" * 70)

        with httpx.Client(timeout=120.0) as client:
            idx_resp = client.post(
                f"{ORCHESTRATOR_URL}/api/workspace/index-codebase",
                json={
                    "is_github": True,
                    "github_owner": "Gaurav-py-Ghosh",
                    "github_repo": "TedxBMU",
                    "github_branch": "main"
                }
            )
            print(f"Orchestrator indexing complete: {idx_resp.status_code}")

            stats_resp = client.get(f"{RAG_SERVICE_URL}/api/database/chunk-stats")
            scip_stats = stats_resp.json()
            print(f"RAG stats before With-SCIP run: {scip_stats}")

        storage.create_run(
            run_id=scip_run_id,
            models=[model],
            scoring_mode="llm",
            judge_model=judge_model,
            total_questions=len(CODEBASE_QUESTION_BANK),
            db_path=db_path
        )

        scip_results = []
        for q in CODEBASE_QUESTION_BANK:
            r = evaluate_ablation_item(
                run_id=scip_run_id,
                q=q,
                model=model,
                variant="with_scip",
                scoring_mode="llm",
                judge_model=judge_model,
                db_path=db_path
            )
            scip_results.append(r)

        storage.update_run_status(scip_run_id, "completed", None, db_path)

        # ══════════════════════════════════════════════════════════════
        # PHASE 3: Comparative Analysis & Report Generation
        # ══════════════════════════════════════════════════════════════
        print("\n" + "=" * 70)
        print(">>> ABLATION PHASE 3: COMPUTING COMPARATIVE REPORT & DELTAS...")
        print("=" * 70)

        report = generate_ablation_report_data(
            ablation_id=ablation_id,
            model=model,
            baseline_results=baseline_results,
            scip_results=scip_results,
            baseline_stats=stats_data,
            scip_stats=scip_stats
        )

        report_json_str = json.dumps(report, indent=2)
        storage.update_ablation_run(
            ablation_id=ablation_id,
            status="completed",
            baseline_run_id=baseline_run_id,
            scip_run_id=scip_run_id,
            report_json=report_json_str,
            db_path=db_path
        )

        # Also persist report to disk for frontend static import
        out_paths = [
            "D:/AIDeV/ablation_report_scip.json",
            "D:/AIDeV/frontend/src/app/components/evaluation/ablationReportData.json"
        ]
        for p in out_paths:
            try:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(report_json_str)
            except Exception as e:
                print(f"Warning: could not write {p}: {e}")

        print(f"\n>>> Ablation Study Completed! Run ID: {ablation_id}")
        return report

    except Exception as e:
        err = f"Ablation run failed: {e}"
        print(f"Error in ablation run: {err}")
        storage.update_ablation_run(ablation_id, status="failed", error_msg=err, db_path=db_path)
        raise e


def generate_ablation_report_data(
    ablation_id: str,
    model: str,
    baseline_results: List[Dict[str, Any]],
    scip_results: List[Dict[str, Any]],
    baseline_stats: Dict[str, Any],
    scip_stats: Dict[str, Any]
) -> Dict[str, Any]:
    """Calculates aggregate statistics and per-question deltas between baseline and SCIP."""

    def mean(lst):
        nums = [x for x in lst if x is not None]
        return round(sum(nums) / len(nums), 4) if nums else 0.0

    b_correct = [r["correctness_score"] for r in baseline_results]
    s_correct = [r["correctness_score"] for r in scip_results]

    b_prompt_tok = [r["prompt_tokens"] for r in baseline_results]
    s_prompt_tok = [r["prompt_tokens"] for r in scip_results]

    b_comp_tok = [r["completion_tokens"] for r in baseline_results]
    s_comp_tok = [r["completion_tokens"] for r in scip_results]

    b_total_tok = [r["total_tokens"] for r in baseline_results]
    s_total_tok = [r["total_tokens"] for r in scip_results]

    b_latency = [r["latency_seconds"] for r in baseline_results]
    s_latency = [r["latency_seconds"] for r in scip_results]

    b_relevance = [r["relevance_score"] for r in baseline_results]
    s_relevance = [r["relevance_score"] for r in scip_results]

    b_context_chars = [r.get("context_char_count", 0) for r in baseline_results]
    s_context_chars = [r.get("context_char_count", 0) for r in scip_results]

    # Retrieval Quality Breakdown
    b_retrieval_dist = {
        "correct": sum(1 for r in baseline_results if r["retrieval_quality"] == "correct"),
        "partial": sum(1 for r in baseline_results if r["retrieval_quality"] == "partial"),
        "wrong": sum(1 for r in baseline_results if r["retrieval_quality"] == "wrong"),
    }
    s_retrieval_dist = {
        "correct": sum(1 for r in scip_results if r["retrieval_quality"] == "correct"),
        "partial": sum(1 for r in scip_results if r["retrieval_quality"] == "partial"),
        "wrong": sum(1 for r in scip_results if r["retrieval_quality"] == "wrong"),
    }

    # Per-Question Comparison Table
    b_by_q = {r["question_id"]: r for r in baseline_results}
    s_by_q = {r["question_id"]: r for r in scip_results}

    question_comparisons = []
    for q in CODEBASE_QUESTION_BANK:
        qid = q["id"]
        b_r = b_by_q.get(qid, {})
        s_r = s_by_q.get(qid, {})

        c_delta = round((s_r.get("correctness_score") or 0.0) - (b_r.get("correctness_score") or 0.0), 4)
        lat_delta = round((s_r.get("latency_seconds") or 0.0) - (b_r.get("latency_seconds") or 0.0), 4)
        p_tok_delta = (s_r.get("prompt_tokens") or 0) - (b_r.get("prompt_tokens") or 0)
        c_tok_delta = (s_r.get("completion_tokens") or 0) - (b_r.get("completion_tokens") or 0)

        question_comparisons.append({
            "question_id": qid,
            "category": q["category"],
            "tag": q["tag"],
            "question": q["question"],
            "expected_sources": q["expected_sources"],
            "baseline": {
                "correctness": b_r.get("correctness_score", 0.0),
                "retrieval_quality": b_r.get("retrieval_quality", "wrong"),
                "prompt_tokens": b_r.get("prompt_tokens", 0),
                "completion_tokens": b_r.get("completion_tokens", 0),
                "total_tokens": b_r.get("total_tokens", 0),
                "latency_seconds": b_r.get("latency_seconds", 0.0),
                "relevance": b_r.get("relevance_score", 0.0),
                "context_chars": b_r.get("context_char_count", 0),
                "response_snippet": (b_r.get("llm_response") or "")[:240] + "..."
            },
            "with_scip": {
                "correctness": s_r.get("correctness_score", 0.0),
                "retrieval_quality": s_r.get("retrieval_quality", "correct"),
                "prompt_tokens": s_r.get("prompt_tokens", 0),
                "completion_tokens": s_r.get("completion_tokens", 0),
                "total_tokens": s_r.get("total_tokens", 0),
                "latency_seconds": s_r.get("latency_seconds", 0.0),
                "relevance": s_r.get("relevance_score", 0.0),
                "context_chars": s_r.get("context_char_count", 0),
                "response_snippet": (s_r.get("llm_response") or "")[:240] + "..."
            },
            "deltas": {
                "correctness_delta": c_delta,
                "latency_delta_seconds": lat_delta,
                "prompt_tokens_delta": p_tok_delta,
                "completion_tokens_delta": c_tok_delta
            }
        })

    avg_b_corr = mean(b_correct)
    avg_s_corr = mean(s_correct)
    avg_b_lat = mean(b_latency)
    avg_s_lat = mean(s_latency)
    avg_b_ptok = mean(b_prompt_tok)
    avg_s_ptok = mean(s_prompt_tok)
    avg_b_ctok = mean(b_comp_tok)
    avg_s_ctok = mean(s_comp_tok)
    avg_b_ttok = mean(b_total_tok)
    avg_s_ttok = mean(s_total_tok)
    avg_b_rel = mean(b_relevance)
    avg_s_rel = mean(s_relevance)
    avg_b_chars = mean(b_context_chars)
    avg_s_chars = mean(s_context_chars)

    return {
        "ablation_id": ablation_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "question_count": len(CODEBASE_QUESTION_BANK),
        "corpus_stats": {
            "baseline": baseline_stats,
            "with_scip": scip_stats
        },
        "aggregate_deltas": {
            "correctness": {
                "baseline": avg_b_corr,
                "with_scip": avg_s_corr,
                "delta": round(avg_s_corr - avg_b_corr, 4),
                "percent_improvement": round(((avg_s_corr - avg_b_corr) / max(avg_b_corr, 0.001)) * 100, 1)
            },
            "prompt_tokens": {
                "baseline": avg_b_ptok,
                "with_scip": avg_s_ptok,
                "delta": round(avg_s_ptok - avg_b_ptok, 1),
                "tokens_saved": round(avg_b_ptok - avg_s_ptok, 1)
            },
            "completion_tokens": {
                "baseline": avg_b_ctok,
                "with_scip": avg_s_ctok,
                "delta": round(avg_s_ctok - avg_b_ctok, 1)
            },
            "total_tokens": {
                "baseline": avg_b_ttok,
                "with_scip": avg_s_ttok,
                "delta": round(avg_s_ttok - avg_b_ttok, 1)
            },
            "latency_seconds": {
                "baseline": avg_b_lat,
                "with_scip": avg_s_lat,
                "delta": round(avg_s_lat - avg_b_lat, 4),
                "speedup_seconds": round(avg_b_lat - avg_s_lat, 4)
            },
            "context_relevance": {
                "baseline": avg_b_rel,
                "with_scip": avg_s_rel,
                "delta": round(avg_s_rel - avg_b_rel, 4)
            },
            "context_chars": {
                "baseline": avg_b_chars,
                "with_scip": avg_s_chars,
                "delta": round(avg_s_chars - avg_b_chars, 1)
            }
        },
        "retrieval_distribution": {
            "baseline": b_retrieval_dist,
            "with_scip": s_retrieval_dist
        },
        "question_comparisons": question_comparisons
    }
