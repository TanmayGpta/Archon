import sqlite3
import json
import os
from typing import List, Dict, Any, Optional, Set, Tuple
from datetime import datetime, timezone
from .config import DB_PATH

def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or DB_PATH
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn

def init_db(db_path: Optional[str] = None):
    """Initializes SQLite database schema."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id           TEXT PRIMARY KEY,
                created_at   TEXT NOT NULL,
                status       TEXT NOT NULL,
                models       TEXT NOT NULL,
                scoring_mode TEXT NOT NULL,
                judge_model  TEXT,
                total_questions INTEGER NOT NULL,
                completed    INTEGER DEFAULT 0,
                error_msg    TEXT
            );
            """)

            conn.execute("""
            CREATE TABLE IF NOT EXISTS results (
                id                   TEXT PRIMARY KEY,
                run_id               TEXT NOT NULL,
                question_id          TEXT NOT NULL,
                model                TEXT NOT NULL,
                question_text        TEXT NOT NULL,
                group_label          TEXT NOT NULL,
                tag                  TEXT NOT NULL,
                expected_sources     TEXT NOT NULL,
                expected_keywords    TEXT NOT NULL,
                is_code_question     INTEGER NOT NULL,
                exercise_5_candidate INTEGER NOT NULL,
                exercise_6_multihop  INTEGER NOT NULL,

                llm_response         TEXT,
                prompt_used          TEXT,

                latency_seconds      REAL,
                prompt_tokens        INTEGER,
                completion_tokens    INTEGER,
                total_tokens         INTEGER,

                correctness_score    REAL,
                correctness_method   TEXT,
                relevance_score      REAL,
                retrieval_quality    TEXT,
                hallucination_flag   INTEGER,
                hallucination_notes  TEXT,
                code_test_passed     INTEGER,
                code_test_notes      TEXT,

                avg_cpu_percent      REAL,
                peak_cpu_percent     REAL,
                avg_ram_mb           REAL,
                peak_ram_mb          REAL,
                avg_gpu_util         REAL,
                peak_gpu_util        REAL,
                avg_gpu_mem_mb       REAL,
                peak_gpu_mem_mb      REAL,

                rag_latency_seconds  REAL,
                context_char_count   INTEGER,
                scip_chunks_in_top3  INTEGER,
                ablation_variant     TEXT,

                completed_at         TEXT,
                error_msg            TEXT
            );
            """)

            conn.execute("""
            CREATE TABLE IF NOT EXISTS ablation_runs (
                id              TEXT PRIMARY KEY,
                created_at      TEXT NOT NULL,
                status          TEXT NOT NULL,
                model           TEXT NOT NULL,
                baseline_run_id TEXT,
                scip_run_id     TEXT,
                report_json     TEXT,
                error_msg       TEXT
            );
            """)

            # Auto-migrate new ablation columns into existing results table if missing
            cur = conn.cursor()
            cur.execute("PRAGMA table_info(results)")
            existing_cols = {row["name"] for row in cur.fetchall()}
            for col, col_type in [
                ("rag_latency_seconds", "REAL"),
                ("context_char_count", "INTEGER"),
                ("scip_chunks_in_top3", "INTEGER"),
                ("ablation_variant", "TEXT")
            ]:
                if col not in existing_cols:
                    try:
                        conn.execute(f"ALTER TABLE results ADD COLUMN {col} {col_type}")
                    except Exception:
                        pass

            conn.execute("""
            CREATE TABLE IF NOT EXISTS retrieved_contexts (
                id              TEXT PRIMARY KEY,
                result_id       TEXT NOT NULL,
                run_id          TEXT NOT NULL,
                question_id     TEXT NOT NULL,
                model           TEXT NOT NULL,

                bm25_chunks     TEXT NOT NULL,
                dense_chunks    TEXT NOT NULL,
                ce_chunks       TEXT NOT NULL,

                retrieval_outcome TEXT,
                context_used      TEXT,

                multihop_sources_found TEXT,
                multihop_chain_complete INTEGER
            );
            """)

            conn.execute("""
            CREATE TABLE IF NOT EXISTS resource_samples (
                id          TEXT PRIMARY KEY,
                result_id   TEXT NOT NULL,
                run_id      TEXT NOT NULL,
                sampled_at  TEXT NOT NULL,
                cpu_percent REAL,
                ram_mb      REAL,
                gpu_util    REAL,
                gpu_mem_mb  REAL
            );
            """)
    finally:
        conn.close()

def create_run(
    run_id: str,
    models: List[str],
    scoring_mode: str,
    judge_model: Optional[str],
    total_questions: int,
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    conn = get_db_connection(db_path)
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO runs (id, created_at, status, models, scoring_mode, judge_model, total_questions, completed)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (run_id, now_iso, "running", json.dumps(models), scoring_mode, judge_model, total_questions)
            )
        return get_run(run_id, db_path)
    finally:
        conn.close()

def get_run(run_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_db_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM runs WHERE id = ?", (run_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["models"] = json.loads(d["models"]) if isinstance(d["models"], str) else d["models"]
        return d
    finally:
        conn.close()

def list_runs(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM runs ORDER BY created_at DESC")
        rows = cur.fetchall()
        runs = []
        for r in rows:
            d = dict(r)
            d["models"] = json.loads(d["models"]) if isinstance(d["models"], str) else d["models"]
            runs.append(d)
        return runs
    finally:
        conn.close()

def get_completed_pairs(run_id: str, db_path: Optional[str] = None) -> Set[Tuple[str, str]]:
    conn = get_db_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT question_id, model FROM results WHERE run_id = ? AND completed_at IS NOT NULL", (run_id,))
        rows = cur.fetchall()
        return {(r["question_id"], r["model"]) for r in rows}
    finally:
        conn.close()

def update_run_status(
    run_id: str,
    status: str,
    error_msg: Optional[str] = None,
    db_path: Optional[str] = None
):
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute(
                "UPDATE runs SET status = ?, error_msg = ? WHERE id = ?",
                (status, error_msg, run_id)
            )
    finally:
        conn.close()

def save_result(
    result_data: Dict[str, Any],
    context_data: Dict[str, Any],
    samples_data: List[Dict[str, Any]],
    db_path: Optional[str] = None
):
    """Atomically saves result row, context row, samples and increments run progress."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            # Insert into results
            conn.execute(
                """
                INSERT OR REPLACE INTO results (
                    id, run_id, question_id, model, question_text, group_label, tag,
                    expected_sources, expected_keywords, is_code_question, exercise_5_candidate,
                    exercise_6_multihop, llm_response, prompt_used, latency_seconds,
                    prompt_tokens, completion_tokens, total_tokens, correctness_score,
                    correctness_method, relevance_score, retrieval_quality, hallucination_flag,
                    hallucination_notes, code_test_passed, code_test_notes, avg_cpu_percent,
                    peak_cpu_percent, avg_ram_mb, peak_ram_mb, avg_gpu_util, peak_gpu_util,
                    avg_gpu_mem_mb, peak_gpu_mem_mb,
                    rag_latency_seconds, context_char_count, scip_chunks_in_top3, ablation_variant,
                    completed_at, error_msg
                ) VALUES (
                    :id, :run_id, :question_id, :model, :question_text, :group_label, :tag,
                    :expected_sources, :expected_keywords, :is_code_question, :exercise_5_candidate,
                    :exercise_6_multihop, :llm_response, :prompt_used, :latency_seconds,
                    :prompt_tokens, :completion_tokens, :total_tokens, :correctness_score,
                    :correctness_method, :relevance_score, :retrieval_quality, :hallucination_flag,
                    :hallucination_notes, :code_test_passed, :code_test_notes, :avg_cpu_percent,
                    :peak_cpu_percent, :avg_ram_mb, :peak_ram_mb, :avg_gpu_util, :peak_gpu_util,
                    :avg_gpu_mem_mb, :peak_gpu_mem_mb,
                    :rag_latency_seconds, :context_char_count, :scip_chunks_in_top3, :ablation_variant,
                    :completed_at, :error_msg
                )
                """,
                {
                    **result_data,
                    "rag_latency_seconds": result_data.get("rag_latency_seconds"),
                    "context_char_count": result_data.get("context_char_count"),
                    "scip_chunks_in_top3": result_data.get("scip_chunks_in_top3", 0),
                    "ablation_variant": result_data.get("ablation_variant"),
                    "expected_sources": json.dumps(result_data.get("expected_sources", [])),
                    "expected_keywords": json.dumps(result_data.get("expected_keywords", []))
                }
            )

            # Insert into retrieved_contexts
            conn.execute(
                """
                INSERT OR REPLACE INTO retrieved_contexts (
                    id, result_id, run_id, question_id, model,
                    bm25_chunks, dense_chunks, ce_chunks,
                    retrieval_outcome, context_used,
                    multihop_sources_found, multihop_chain_complete
                ) VALUES (
                    :id, :result_id, :run_id, :question_id, :model,
                    :bm25_chunks, :dense_chunks, :ce_chunks,
                    :retrieval_outcome, :context_used,
                    :multihop_sources_found, :multihop_chain_complete
                )
                """,
                {
                    **context_data,
                    "bm25_chunks": json.dumps(context_data.get("bm25_chunks", [])),
                    "dense_chunks": json.dumps(context_data.get("dense_chunks", [])),
                    "ce_chunks": json.dumps(context_data.get("ce_chunks", [])),
                    "multihop_sources_found": json.dumps(context_data.get("multihop_sources_found", []))
                }
            )

            # Insert resource samples
            for sample in samples_data:
                conn.execute(
                    """
                    INSERT INTO resource_samples (
                        id, result_id, run_id, sampled_at, cpu_percent, ram_mb, gpu_util, gpu_mem_mb
                    ) VALUES (
                        :id, :result_id, :run_id, :sampled_at, :cpu_percent, :ram_mb, :gpu_util, :gpu_mem_mb
                    )
                    """,
                    sample
                )

            # Update runs table completed count
            run_id = result_data["run_id"]
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM results WHERE run_id = ? AND completed_at IS NOT NULL", (run_id,))
            completed_count = cur.fetchone()[0]

            cur.execute("SELECT total_questions FROM runs WHERE id = ?", (run_id,))
            run_row = cur.fetchone()
            total_q = run_row[0] if run_row else 78

            status = "completed" if completed_count >= total_q else "running"

            conn.execute(
                "UPDATE runs SET completed = ?, status = ? WHERE id = ?",
                (completed_count, status, run_id)
            )
    finally:
        conn.close()

def get_results(run_id: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM results WHERE run_id = ? ORDER BY question_id ASC, model ASC", (run_id,))
        rows = cur.fetchall()
        results = []
        for r in rows:
            d = dict(r)
            d["expected_sources"] = json.loads(d["expected_sources"]) if d["expected_sources"] else []
            d["expected_keywords"] = json.loads(d["expected_keywords"]) if d["expected_keywords"] else []
            results.append(d)
        return results
    finally:
        conn.close()

def get_contexts(run_id: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM retrieved_contexts WHERE run_id = ? ORDER BY question_id ASC, model ASC", (run_id,))
        rows = cur.fetchall()
        contexts = []
        for r in rows:
            d = dict(r)
            d["bm25_chunks"] = json.loads(d["bm25_chunks"]) if d["bm25_chunks"] else []
            d["dense_chunks"] = json.loads(d["dense_chunks"]) if d["dense_chunks"] else []
            d["ce_chunks"] = json.loads(d["ce_chunks"]) if d["ce_chunks"] else []
            d["multihop_sources_found"] = json.loads(d["multihop_sources_found"]) if d["multihop_sources_found"] else []
            contexts.append(d)
        return contexts
    finally:
        conn.close()

def create_ablation_run(
    ablation_id: str,
    model: str,
    status: str = "running",
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    conn = get_db_connection(db_path)
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO ablation_runs (id, created_at, status, model)
                VALUES (?, ?, ?, ?)
                """,
                (ablation_id, now_iso, status, model)
            )
        return get_ablation_run(ablation_id, db_path)
    finally:
        conn.close()

def update_ablation_run(
    ablation_id: str,
    status: str,
    baseline_run_id: Optional[str] = None,
    scip_run_id: Optional[str] = None,
    report_json: Optional[str] = None,
    error_msg: Optional[str] = None,
    db_path: Optional[str] = None
):
    conn = get_db_connection(db_path)
    try:
        with conn:
            updates = ["status = ?"]
            params = [status]
            if baseline_run_id is not None:
                updates.append("baseline_run_id = ?")
                params.append(baseline_run_id)
            if scip_run_id is not None:
                updates.append("scip_run_id = ?")
                params.append(scip_run_id)
            if report_json is not None:
                updates.append("report_json = ?")
                params.append(report_json)
            if error_msg is not None:
                updates.append("error_msg = ?")
                params.append(error_msg)
            params.append(ablation_id)
            conn.execute(f"UPDATE ablation_runs SET {', '.join(updates)} WHERE id = ?", params)
    finally:
        conn.close()

def get_ablation_run(ablation_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_db_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM ablation_runs WHERE id = ?", (ablation_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("report_json"):
            try:
                d["report"] = json.loads(d["report_json"])
            except Exception:
                d["report"] = None
        return d
    finally:
        conn.close()

def list_ablation_runs(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, created_at, status, model, baseline_run_id, scip_run_id, error_msg FROM ablation_runs ORDER BY created_at DESC")
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

