# Evaluation Microservice Architecture Plan
> **Status:** Approved for Implementation (v2 — all review fixes applied)
> **Target:** `services/evaluation_service/`
> **Covers:** Lab 4 Exercises 1, 2, 3, 4, 5, 6

---

## 1. Context & Goals

The Archon Copilot stack (Week 3) is a multi-microservice RAG system with:
- **Ingestion Service** (port 8002) — parses YAML/JSON/Markdown files into enriched chunks
- **RAG Service** (port 8001) — hybrid BM25 + Dense (BGE-small-en-v1.5) + Cross-Encoder (MS-Marco) retrieval with ChromaDB
- **Orchestrator Service** (port 8000) — builds prompts, streams responses from Ollama
- **UI Service** (port 3000) — Next.js frontend

Lab 4 requires:

| Exercise | Requirement |
|---|---|
| Ex 1 | Evaluate ≥3 LLM models under identical conditions |
| Ex 2 | 20–30 representative questions used for all models |
| Ex 3 | Quantitative metrics: correctness, relevance, retrieval quality, hallucination rate, code test-pass rate, latency, token usage, CPU/GPU/RAM |
| Ex 4 | Cross-model analysis (quantitative evidence only) |
| Ex 5 | QUESTION → RETRIEVED CONTEXT → LLM RESPONSE chain; classify retrieval outcome |
| Ex 6 | Multi-hop / multi-file questions — evidence that the RAG system can or cannot answer across multiple documents |

The evaluation service runs **once** per full benchmark run, persists every result immediately to SQLite (so OOM/crashes lose no data), supports **resume** from last completed question, and exposes a REST API identical in structure to the other microservices.

---

## 2. PREREQUISITE: RAG Service Modification

> **CRITICAL:** The current RAG service `/api/search` endpoint does NOT return chunk metadata (`source`, `endpoint`). The evaluation service needs this metadata for retrieval quality scoring, Exercise 5 tracing, and Exercise 6 multi-hop analysis. This modification MUST be done BEFORE building the evaluation service.

### 2.1 Current RAG Search Response Format (BEFORE modification)

File: `services/rag_service/app/search_engine.py` — `search()` method (line 126)

Each result in `bm25`, `dense`, and `cross_encoder` arrays currently looks like:
```python
{
    "rank": 1,
    "score": "BM25: 3.42",   # NOTE: score is a FORMATTED STRING, not a float
    "text": "API: Order Management API (v1.0.0)\nEndpoint: POST /orders\n..."
}
```

The `source`, `endpoint`, `api_title` metadata IS stored in ChromaDB metadatas (see `ingest_chunks()` at line 92) but is NOT included in search results.

### 2.2 Required Modification

Modify `services/rag_service/app/search_engine.py` to include chunk metadata in search results. The metadata is available via `self.docs_metas` (parallel array to `self.docs_texts`) loaded by `load_bm25()` at line 37.

**Changes needed in the `search()` method:**

#### BM25 results (around line 138):
```python
# BEFORE:
bm25_results.append({
    "rank": i + 1,
    "score": f"BM25: {scores[idx]:.2f}",
    "text": self.docs_texts[idx]
})

# AFTER:
meta = self.docs_metas[idx] if idx < len(self.docs_metas) else {}
bm25_results.append({
    "rank": i + 1,
    "score": f"BM25: {scores[idx]:.2f}",
    "text": self.docs_texts[idx],
    "source": meta.get("source", "unknown"),
    "endpoint": meta.get("endpoint", ""),
    "api_title": meta.get("api_title", "")
})
```

#### Dense results (around line 162):
The dense search uses `collection.query()` which returns `raw['metadatas'][0]`. Modify:
```python
# BEFORE:
dense_results.append({
    "rank": i + 1,
    "score": f"L2 Dist: {dists[i]:.4f}",
    "text": docs[i]
})

# AFTER:
meta = raw['metadatas'][0][i] if 'metadatas' in raw and raw['metadatas'] and i < len(raw['metadatas'][0]) else {}
dense_results.append({
    "rank": i + 1,
    "score": f"L2 Dist: {dists[i]:.4f}",
    "text": docs[i],
    "source": meta.get("source", "unknown"),
    "endpoint": meta.get("endpoint", ""),
    "api_title": meta.get("api_title", "")
})
```

#### Cross-Encoder results (around line 184):
The cross-encoder re-ranks from the candidate pool (plain text). To attach metadata, build a text→metadata lookup from `self.docs_texts` and `self.docs_metas`:
```python
# ADD before the cross-encoder section (around line 172):
text_to_meta = {}
for t, m in zip(self.docs_texts, self.docs_metas):
    text_to_meta[t] = m

# BEFORE:
cross_results.append({
    "rank": i + 1,
    "score": f"Logit: {float(score):.4f}",
    "text": doc
})

# AFTER:
meta = text_to_meta.get(doc, {})
cross_results.append({
    "rank": i + 1,
    "score": f"Logit: {float(score):.4f}",
    "text": doc,
    "source": meta.get("source", "unknown"),
    "endpoint": meta.get("endpoint", ""),
    "api_title": meta.get("api_title", "")
})
```

#### Fallback N/A results:
For the fallback "no results" entries (lines 148, 170, 190), add `"source": "", "endpoint": "", "api_title": ""` to the dict.

### 2.3 Post-Modification Response Format

After modification, `POST /api/search` returns:
```json
{
    "bm25": [
        {"rank": 1, "score": "BM25: 3.42", "text": "...", "source": "order_management_api.yaml", "endpoint": "POST /orders", "api_title": "Order Management API"}
    ],
    "dense": [
        {"rank": 1, "score": "L2 Dist: 0.4231", "text": "...", "source": "...", "endpoint": "...", "api_title": "..."}
    ],
    "cross_encoder": [
        {"rank": 1, "score": "Logit: 3.1234", "text": "...", "source": "...", "endpoint": "...", "api_title": "..."}
    ],
    "candidate_count": 14
}
```

> **IMPORTANT:** This modification does NOT break any existing consumers. The orchestrator only reads `"text"` and `"score"` fields from results. The additional fields are ignored by existing code.

---

## 3. Models & Question Bank

### 3.1 Target Models
Three models run by default. All configurable via environment variables.

| Env Var | Default | Model |
|---|---|---|
| `EVAL_MODEL_1` | `gemma3:4b` | General-purpose (best overall capability) |
| `EVAL_MODEL_2` | `codellama:7b` | Code-instruction model |
| `EVAL_MODEL_3` | `starcoder2:3b` | Code-completion model |

All three models must already be pulled in Ollama. The service validates their availability at startup by calling `GET {OLLAMA_URL}/api/tags` and checking the returned models list.

### 3.2 Question Bank
The 26 questions from `plans/dataset_augmentation_plan.md` Section 6 are hardcoded in `app/questions.py` as a Python list of typed dictionaries. Each question carries:

```python
{
    "id": "Q1",                               # Unique ID
    "group": "Group 1: Single-File Retrieval", # Exercise grouping label
    "tag": "[SINGLE][BM25]",                  # Retrieval complexity tags
    "question": "What fields are required...", # The exact question text
    "expected_sources": ["order_management_api.yaml"],  # Ground-truth source files
    "expected_keywords": ["customer_id", "items", "total_amount"],  # For correctness scoring
    "is_code_question": False,                # True for Q24, Q25, Q26
    "exercise_5_candidate": False,            # True for Q4, Q8, Q12, Q20, Q21
    "exercise_6_multihop": False,             # True for Q15, Q16, Q17, Q18, Q19
}
```

All 26 questions must be used for all 3 models. No filtering.

### 3.3 Complete Question Bank

Transcribe all 26 questions from `plans/dataset_augmentation_plan.md` Section 6 verbatim. The groups are:

- **Group 1 (Q1–Q7): Single-File Retrieval** — baseline questions answerable from one file
- **Group 2 (Q8–Q14): Two-File Cross-Referencing** — requires exactly 2 files
- **Group 3 (Q15–Q19): Multi-File / Multi-Hop** — requires 3+ files (Exercise 6)
- **Group 4 (Q20–Q23): Retrieval Failure / Decoy** — designed failure scenarios (Exercise 5)
- **Group 5 (Q24–Q26): Code Generation** — code synthesis questions

**Exercise 5 candidates** (full QUESTION→CONTEXT→RESPONSE trace in report): Q4, Q8, Q12, Q20, Q21
**Exercise 6 candidates** (multi-hop chain completeness): Q15, Q16, Q17, Q18, Q19

---

## 4. File & Directory Layout

```
services/evaluation_service/
├── Dockerfile
├── requirements.txt
└── app/
    ├── __init__.py
    ├── main.py           # FastAPI app, routes, background task launcher
    ├── config.py         # All env vars
    ├── questions.py      # 26 question bank (typed dicts)
    ├── evaluator.py      # Core evaluation orchestrator (one question × one model)
    ├── metrics.py        # All metric calculators (correctness, hallucination, tokens, latency, code test, resources)
    ├── judge.py          # LLM-as-judge adapter (switches between keyword and Ollama judge)
    ├── corpus_loader.py  # Builds CORPUS_ENDPOINTS set by calling ingestion service API
    └── storage.py        # SQLite layer (schema creation, CRUD, resume logic)
```

---

## 5. Configuration (`app/config.py`)

All values read from environment variables with safe defaults:

```python
import os

PORT = int(os.getenv("PORT", "8003"))
HOST = os.getenv("HOST", "0.0.0.0")

OLLAMA_URL       = os.getenv("OLLAMA_URL", "http://172.31.112.1:11434")
RAG_SERVICE_URL  = os.getenv("RAG_SERVICE_URL", "http://rag-service:8001")
INGESTION_SERVICE_URL = os.getenv("INGESTION_SERVICE_URL", "http://ingestion-service:8002")

EVAL_MODEL_1 = os.getenv("EVAL_MODEL_1", "gemma3:4b")
EVAL_MODEL_2 = os.getenv("EVAL_MODEL_2", "codellama:7b")
EVAL_MODEL_3 = os.getenv("EVAL_MODEL_3", "starcoder2:3b")

# Scoring mode: "keyword" (default) or "llm"
SCORING_MODE    = os.getenv("SCORING_MODE", "keyword")
JUDGE_MODEL     = os.getenv("JUDGE_MODEL", "gemma3:1b")  # Only used in llm mode

# GPU sampling: "nvidia-smi" or "none"
GPU_SAMPLING    = os.getenv("GPU_SAMPLING", "none")
NVIDIA_SMI_PATH = os.getenv("NVIDIA_SMI_PATH", "/usr/bin/nvidia-smi")

# SQLite file path (persisted on a named Docker volume)
DB_PATH = os.getenv("DB_PATH", "/app/data/evaluation.db")

# Resource sampling interval in seconds
RESOURCE_POLL_INTERVAL = float(os.getenv("RESOURCE_POLL_INTERVAL", "0.5"))
```

**Key differences from original plan:**
- `ORCHESTRATOR_URL` **removed** — evaluation service never calls the orchestrator
- `GPU_SAMPLING` defaults to `"none"` — nvidia-smi requires NVIDIA runtime; enable explicitly when available
- `NVIDIA_SMI_PATH` defaults to `/usr/bin/nvidia-smi` (host binary location)
- Added `INGESTION_SERVICE_URL` — needed for `corpus_loader.py` to build the endpoint set

---

## 6. SQLite Schema (`app/storage.py`)

Four normalized tables. All created at service startup via `CREATE TABLE IF NOT EXISTS`.

### Table: `runs`
Tracks one evaluation run (all 26 questions × all 3 models = 78 pairs per run).

```sql
CREATE TABLE IF NOT EXISTS runs (
    id           TEXT PRIMARY KEY,      -- UUID run_id
    created_at   TEXT NOT NULL,         -- ISO8601 timestamp
    status       TEXT NOT NULL,         -- "running" | "completed" | "failed"
    models       TEXT NOT NULL,         -- JSON array of model names
    scoring_mode TEXT NOT NULL,         -- "keyword" | "llm"
    judge_model  TEXT,                  -- Model used as judge (if llm mode)
    total_questions INTEGER NOT NULL,   -- Always 26 * num_models = 78
    completed    INTEGER DEFAULT 0,     -- Count of completed question-model pairs
    error_msg    TEXT                   -- Set if status = "failed"
);
```

### Table: `results`
One row per (question, model) pair. Written immediately after each generation completes (atomic transaction).

```sql
CREATE TABLE IF NOT EXISTS results (
    id                   TEXT PRIMARY KEY,   -- UUID
    run_id               TEXT NOT NULL,      -- FK -> runs.id
    question_id          TEXT NOT NULL,      -- e.g. "Q1"
    model                TEXT NOT NULL,      -- e.g. "gemma3:4b"
    question_text        TEXT NOT NULL,
    group_label          TEXT NOT NULL,
    tag                  TEXT NOT NULL,
    expected_sources     TEXT NOT NULL,      -- JSON array
    expected_keywords    TEXT NOT NULL,      -- JSON array
    is_code_question     INTEGER NOT NULL,   -- 0 or 1
    exercise_5_candidate INTEGER NOT NULL,  -- 0 or 1
    exercise_6_multihop  INTEGER NOT NULL,  -- 0 or 1

    -- LLM Response
    llm_response         TEXT,              -- Full text of LLM answer
    prompt_used          TEXT,              -- The exact prompt sent to Ollama

    -- Performance Metrics (Exercise 3)
    latency_seconds      REAL,             -- Wall-clock time: first request to done=True
    prompt_tokens        INTEGER,          -- prompt_eval_count from Ollama response
    completion_tokens    INTEGER,          -- eval_count from Ollama response
    total_tokens         INTEGER,          -- prompt + completion

    -- Quality Metrics (Exercise 3)
    correctness_score    REAL,             -- 0.0 – 1.0
    correctness_method   TEXT,             -- "keyword" | "llm"
    relevance_score      REAL,             -- 0.0 – 1.0 Jaccard overlap response/context
    retrieval_quality    TEXT,             -- "correct" | "partial" | "wrong" | "decoy_surfaced"
    hallucination_flag   INTEGER,          -- 0 or 1
    hallucination_notes  TEXT,             -- Explanation
    code_test_passed     INTEGER,          -- NULL if not code Q; 0 or 1 if code Q
    code_test_notes      TEXT,             -- Syntax check result

    -- Resource Metrics (aggregated from resource_samples at completion)
    avg_cpu_percent      REAL,
    peak_cpu_percent     REAL,
    avg_ram_mb           REAL,
    peak_ram_mb          REAL,
    avg_gpu_util         REAL,             -- GPU utilization % (from nvidia-smi)
    peak_gpu_util        REAL,
    avg_gpu_mem_mb       REAL,
    peak_gpu_mem_mb      REAL,

    completed_at         TEXT,             -- ISO8601 timestamp of write
    error_msg            TEXT              -- Set if this specific call failed
);
```

### Table: `retrieved_contexts`
Stores all three retrieval streams per (question, model) pair. Supports Exercise 5 and Exercise 6 analysis.

```sql
CREATE TABLE IF NOT EXISTS retrieved_contexts (
    id              TEXT PRIMARY KEY,
    result_id       TEXT NOT NULL,      -- FK -> results.id
    run_id          TEXT NOT NULL,
    question_id     TEXT NOT NULL,
    model           TEXT NOT NULL,

    bm25_chunks     TEXT NOT NULL,      -- JSON array of {source, endpoint, text, score, rank}
    dense_chunks    TEXT NOT NULL,      -- JSON array of {source, endpoint, text, score, rank}
    ce_chunks       TEXT NOT NULL,      -- JSON array of {source, endpoint, text, score, rank}

    -- Exercise 5 classification
    retrieval_outcome TEXT,             -- "relevant" | "irrelevant" | "missed" | "hallucinated"
    context_used      TEXT,            -- The actual context string injected in the prompt

    -- Exercise 6 multi-hop trace
    multihop_sources_found TEXT,        -- JSON array of sources present in top-5 CE results
    multihop_chain_complete INTEGER    -- 1 if all expected_sources found, 0 otherwise
);
```

### Table: `resource_samples`
Raw time-series samples collected during each generation call. Enables Exercise 3 CPU/GPU timeline charts.

```sql
CREATE TABLE IF NOT EXISTS resource_samples (
    id          TEXT PRIMARY KEY,
    result_id   TEXT NOT NULL,   -- FK -> results.id
    run_id      TEXT NOT NULL,
    sampled_at  TEXT NOT NULL,   -- ISO8601
    cpu_percent REAL,
    ram_mb      REAL,
    gpu_util    REAL,            -- NULL if GPU sampling disabled
    gpu_mem_mb  REAL             -- NULL if GPU sampling disabled
);
```

**Resume logic:** On `POST /api/evaluate/run` with an existing `run_id`, query:
```sql
SELECT question_id, model FROM results WHERE run_id=? AND completed_at IS NOT NULL
```
Build a skip-set from this result. Process remaining pairs in deterministic order: outer loop = Q1→Q26, inner loop = model_1, model_2, model_3.

---

## 7. Metrics Definitions (`app/metrics.py`)

### 7.1 Latency
- **Definition:** Wall-clock elapsed time from sending the Ollama `/api/generate` request to receiving the complete response.
- **Unit:** Seconds (float, 4 decimal places).
- **Capture:** `time.perf_counter()` before and after the `httpx.post()` call in `evaluator.py`. Uses `stream=False` so timing is end-to-end.

### 7.2 Token Usage
- **Definition:** Tokens counted from Ollama's response JSON fields `prompt_eval_count` (prompt tokens) and `eval_count` (generated tokens). These are **only** present in `stream=False` responses or in the final chunk of a streaming response.
- **Stored as:** `prompt_tokens`, `completion_tokens`, `total_tokens = prompt_tokens + completion_tokens`.
- **Fallback:** If fields are missing (old Ollama version), count words in the response text as approximation, record `correctness_method = "word_estimate"`.

### 7.3 CPU & RAM
- **Definition:** A `threading.Thread(daemon=True)` samples `psutil.cpu_percent(interval=None)` and `psutil.Process(os.getpid()).memory_info().rss / 1024**2` every `RESOURCE_POLL_INTERVAL` seconds while the Ollama request is in flight.
- **Samples** written to `resource_samples` table during generation.
- **Aggregated** to `avg_cpu_percent`, `peak_cpu_percent`, `avg_ram_mb`, `peak_ram_mb` after generation completes.

### 7.4 GPU (nvidia-smi polling)
- **Context:** `nvidia-smi` may or may not be available inside the container. If the NVIDIA Container Toolkit is installed on the host and the container is launched with GPU access, `nvidia-smi` is available at its standard path.
- **Sampling:** If `GPU_SAMPLING == "nvidia-smi"`, the same background thread runs every `RESOURCE_POLL_INTERVAL` seconds:
  ```python
  subprocess.run([NVIDIA_SMI_PATH,
      "--query-gpu=utilization.gpu,memory.used",
      "--format=csv,noheader,nounits"],
      capture_output=True, text=True, timeout=1)
  ```
  Parse the output to extract `gpu_util` (%) and `gpu_mem_mb` (MB used).
- **Graceful degradation:** If `GPU_SAMPLING == "none"` (the default), skip all GPU sampling and store NULL for GPU fields. If `nvidia-smi` subprocess fails at runtime, catch the exception, set `GPU_SAMPLING = "none"` for the remainder of the run, and log a warning. No exception raised.
- **Aggregated to:** `avg_gpu_util`, `peak_gpu_util`, `avg_gpu_mem_mb`, `peak_gpu_mem_mb`.

### 7.5 Correctness / Accuracy (`app/judge.py`)
Two modes, switchable via `SCORING_MODE` env var or per-run request override:

#### Mode: `keyword` (default)
```python
matched = sum(1 for kw in expected_keywords if kw.lower() in llm_response.lower())
correctness_score = matched / len(expected_keywords)
```

#### Mode: `llm`
Send structured prompt to `JUDGE_MODEL` via Ollama with `stream=False`. The judge model must NOT be the same model being evaluated for that row — if they are the same, fall back to keyword mode for that pair and log a warning.

Judge prompt template:
```
You are a strict factual evaluator. A developer asked:
QUESTION: {question}

A model responded:
ANSWER: {llm_response}

Expected key facts that should appear in a correct answer:
{expected_keywords}

Score the answer from 0.0 to 1.0:
- 1.0 = All key facts present, no false information
- 0.5 = Partially correct, some key facts present
- 0.0 = Missing all key facts or answer is factually wrong

Reply ONLY with valid JSON: {"score": <float 0.0-1.0>, "reason": "<one sentence>"}
```
Parse `score` → `correctness_score`. Parse `reason` → used in `hallucination_notes` if score < 0.5.

### 7.6 Relevance Score
- **Definition:** Jaccard similarity between the vocabulary of the retrieved context and the LLM response.
- **Calculation:**
  ```python
  stop_words = {"the","a","an","is","in","of","to","and","or","for","with","that","this","it","be","by"}
  ctx_words = set(w.lower() for w in context_used.split() if w.lower() not in stop_words)
  resp_words = set(w.lower() for w in llm_response.split() if w.lower() not in stop_words)
  relevance_score = len(ctx_words & resp_words) / len(ctx_words | resp_words) if (ctx_words | resp_words) else 0.0
  ```

### 7.7 Retrieval Quality
- **Definition:** Categorical classification of whether the correct source files were retrieved.
- **Dual threshold:** Use **top-3** Cross-Encoder results for context building (matching the orchestrator behavior) but check source files across **all returned** Cross-Encoder results (top-5, since `top_k=5` is sent to the RAG service).
- **Source extraction:** After the RAG modification (§2), each CE result has a `"source"` field. Collect `retrieved_sources = {r["source"] for r in ce_results if r.get("source")}`.
- **Values:**
  - `"correct"` — All `expected_sources` found in `retrieved_sources`.
  - `"partial"` — At least one but not all `expected_sources` in `retrieved_sources`.
  - `"wrong"` — None of `expected_sources` in `retrieved_sources`.
  - `"decoy_surfaced"` — `billing_glossary.md` appears in the top-3 CE results `source` fields for a question where it is NOT an `expected_source`.

### 7.8 Hallucination Flag
- **Definition:** Binary. `1` if the LLM asserts an HTTP endpoint (method + path) that does NOT exist in the corpus.
- **Detection (keyword mode):**
  1. At service startup, build `CORPUS_ENDPOINTS` frozenset via `corpus_loader.py` — calls `POST {INGESTION_SERVICE_URL}/api/parse-dataset`, extracts the `endpoint` field from every returned chunk.
  2. Extract HTTP patterns from response: `re.findall(r'\b(GET|POST|PUT|DELETE|PATCH)\s+(/[\w/{}_\-]+)', llm_response)`
  3. For each match, check if it exists in `CORPUS_ENDPOINTS`. Any unrecognized endpoint → `hallucination_flag = 1`.
- **Detection (llm mode):** Judge model's `reason` field is scanned for keywords: `["incorrect", "hallucinated", "not in context", "fabricated", "wrong endpoint", "does not exist"]`. If any found → `hallucination_flag = 1`.

### 7.9 Code Test-Pass Rate
- **Applies to:** Q24, Q25, Q26 (questions with `is_code_question=True`).
- **Steps:**
  1. Extract Python code block: `re.findall(r'```python\n(.*?)```', response, re.DOTALL)`.
  2. If no block found → `code_test_passed = 0`, `code_test_notes = "No Python code block found"`.
  3. Write block to a temp file, run `py_compile.compile(tmpfile)`. Syntax error → `code_test_passed = 0`, store error.
  4. Q24 (order creation): check `requests.post` appears in code.
  5. Q25 (alert escalation): check `requests.post` appears in code.
  6. Q26 (unit test): check `assert` or `unittest` appears in code.
  7. All checks pass → `code_test_passed = 1`.

---

## 8. Corpus Loader (`app/corpus_loader.py`)

> **Approach:** Instead of copying the entire ingestion chunker (fragile — any future change creates divergence), the evaluation service calls the ingestion service's `POST /api/parse-dataset` API at startup to retrieve all chunks, then extracts the `endpoint` field from each.

```python
import httpx
from .config import INGESTION_SERVICE_URL

CORPUS_ENDPOINTS: frozenset = frozenset()

def load_corpus_endpoints() -> frozenset:
    """Calls ingestion service to get all chunks, extracts endpoint set."""
    global CORPUS_ENDPOINTS
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(f"{INGESTION_SERVICE_URL}/api/parse-dataset")
            if resp.status_code == 200:
                data = resp.json()
                chunks = data.get("chunks", [])
                endpoints = set()
                for chunk in chunks:
                    ep = chunk.get("endpoint", "")
                    if ep and ep != "General":
                        endpoints.add(ep)
                CORPUS_ENDPOINTS = frozenset(endpoints)
                print(f"Corpus loader: Loaded {len(CORPUS_ENDPOINTS)} unique endpoints from {len(chunks)} chunks")
            else:
                print(f"Corpus loader: Ingestion service returned {resp.status_code}")
    except Exception as e:
        print(f"Corpus loader: Failed to connect to ingestion service: {e}")
    return CORPUS_ENDPOINTS
```

Called once at service startup in `main.py`:
```python
@app.on_event("startup")
def startup():
    storage.init_db()
    corpus_loader.load_corpus_endpoints()
```

---

## 9. Core Evaluator Logic (`app/evaluator.py`)

The evaluator processes one `(question, model)` pair at a time. For each pair:

### Step 1: Check Resume
Query storage for an existing `results` row with `(run_id, question_id, model)` where `completed_at IS NOT NULL`. If found → skip.

### Step 2: Retrieve Context (RAG)

**CRITICAL: Correct API call and response parsing.**

```python
resp = httpx.post(
    f"{RAG_SERVICE_URL}/api/search",
    json={"query": question_text, "top_k": 5},
    timeout=30.0
)
search_data = resp.json()

# Response keys are: "bm25", "dense", "cross_encoder", "candidate_count"
# NOT "bm25_results" or "cross_encoder_results"
bm25_results    = search_data.get("bm25", [])
dense_results   = search_data.get("dense", [])
ce_results      = search_data.get("cross_encoder", [])
```

Each result item (after the RAG modification in §2) contains:
```python
{
    "rank": 1,
    "score": "Logit: 3.1234",     # String, not float
    "text": "API: Order Management API...",
    "source": "order_management_api.yaml",
    "endpoint": "POST /orders",
    "api_title": "Order Management API"
}
```

**Filter out N/A results** (the RAG service appends fallback entries with `"score": "N/A"` when no results found):
```python
def valid_result(r):
    return isinstance(r, dict) and "text" in r and r.get("score") != "N/A"

bm25_valid = [r for r in bm25_results if valid_result(r)]
dense_valid = [r for r in dense_results if valid_result(r)]
ce_valid = [r for r in ce_results if valid_result(r)]
```

**Build context from top-3 Cross-Encoder results** (matching orchestrator behavior):
```python
context_chunks = ce_valid[:3]
context_text = "\n\n---\n\n".join([c["text"] for c in context_chunks])
```

**Store all returned results** (up to top-5) for the `retrieved_contexts` table.

### Step 3: Build Prompt
Use the **exact same prompt template** as `services/orchestrator_service/app/main.py` lines 202–211:
```python
prompt = f"""You are an Enterprise API Copilot, an expert AI assistant specializing in API integrations, endpoint specifications, and developer code synthesis.
Answer the developer's question accurately, completely, and concisely based on the provided API documentation context below.
Provide production-ready code examples (e.g. cURL, Python, TypeScript) with correct endpoints, parameters, and headers where applicable.

### API Documentation Context:
{context_text if context_text else 'No specific API documentation found.'}

### Developer Query:
{question_text}
"""
```

> **CRITICAL:** This prompt template must be byte-for-byte identical to the orchestrator's. Do NOT modify formatting, newlines, or spacing. The orchestrator at `services/orchestrator_service/app/main.py` lines 202–211 is the source of truth.

### Step 4: Start Resource Sampling Thread
```python
stop_event = threading.Event()
samples = []
t = threading.Thread(target=resource_sampler, args=(stop_event, samples, result_id, run_id), daemon=True)
t.start()
```
The `resource_sampler` function polls CPU/RAM/GPU and appends to `samples` list AND writes rows to `resource_samples` table in real-time.

### Step 5: Call Ollama (non-streaming, timed)
```python
t_start = time.perf_counter()
resp = httpx.post(f"{OLLAMA_URL}/api/generate",
    json={"model": model, "prompt": prompt, "stream": False},
    timeout=300.0)
t_end = time.perf_counter()
latency = t_end - t_start
data = resp.json()
llm_response = data.get("response", "")
prompt_tokens = data.get("prompt_eval_count", 0)
completion_tokens = data.get("eval_count", 0)
```

### Step 6: Stop Resource Sampling Thread
```python
stop_event.set()
t.join(timeout=2.0)
```

### Step 7: Compute All Metrics
```python
correctness, method = judge.score(question, llm_response, expected_keywords, expected_sources, model)
relevance = metrics.compute_relevance(context_text, llm_response)
retrieval_quality = metrics.classify_retrieval(ce_valid, expected_sources)
hallucination_flag, hall_notes = metrics.detect_hallucination(llm_response, CORPUS_ENDPOINTS)
code_passed, code_notes = metrics.test_code(llm_response, question_id) if is_code_question else (None, None)
avg_cpu, peak_cpu, avg_ram, peak_ram, avg_gpu, peak_gpu, avg_gmem, peak_gmem = metrics.aggregate_samples(samples)
retrieval_outcome = metrics.classify_retrieval_outcome(ce_valid, expected_sources, hallucination_flag)
multihop_found, chain_complete = metrics.check_multihop(ce_valid, expected_sources) if exercise_6_multihop else ([], False)
```

### Step 8: Atomic Write to SQLite
Single `BEGIN IMMEDIATE` transaction writing:
1. `results` row with all metrics and `completed_at = NOW()`
2. `retrieved_contexts` row (storing `bm25_valid`, `dense_valid`, `ce_valid` as JSON arrays)
3. Update `runs.completed += 1` (and `runs.status = "completed"` if all 78 done)

### Step 9: Log Progress
```
[run_id[:8]] Q{n}/26 {model:20s} | correct={correctness:.2f} | latency={latency:.2f}s | tokens={total_tokens} | retrieval={retrieval_quality}
```

---

## 10. FastAPI Routes (`app/main.py`)

All routes follow the same pattern as other services. CORS open to `*`.

### Health
```
GET /health
→ {"status": "healthy", "service": "evaluation_service", "db_path": "...", "models_available": [...], "corpus_endpoints_loaded": <int>}
```

### Start Evaluation Run
```
POST /api/evaluate/run
Body: {
    "run_id": null,          # Optional. Provided + exists in DB = RESUME that run
    "models": null,          # Optional override list. Defaults to [EVAL_MODEL_1/2/3]
    "scoring_mode": null     # Optional: "keyword" or "llm"
}
→ {"run_id": "<uuid>", "status": "started"|"resumed", "total": 78, "already_completed": 0, "remaining": 78}
```
Runs in `asyncio.create_task()` background. Returns immediately. If `run_id` is provided and `status = "completed"`, returns immediately with `{"status": "already_complete"}`.

### Poll Status
```
GET /api/evaluate/status/{run_id}
→ {
    "run_id": "...",
    "status": "running" | "completed" | "failed",
    "completed": 45,
    "total": 78,
    "percent": 57.7,
    "current_question": "Q12",
    "current_model": "codellama:7b",
    "error_msg": null
  }
```

### Get Raw Results
```
GET /api/evaluate/results/{run_id}
→ {"run_id": "...", "status": "...", "results": [...], "contexts": [...]}
```

### Generate Structured Report (Exercise 3, 4, 5, 6)
```
GET /api/evaluate/report/{run_id}
```
Returns a structured JSON report covering:
- `exercise_1`: per-model summary stats (model name, total questions, avg correctness, avg latency)
- `exercise_2`: question bank (all 26 questions with metadata)
- `exercise_3`: metric definitions + per-model aggregate tables (avg/min/max for each metric)
- `exercise_4`: cross-model comparison structured as:
  - `best_accuracy`: model with highest avg correctness_score
  - `fewest_hallucinations`: model with lowest hallucination count
  - `best_retrieval`: model with most "correct" retrieval_quality
  - `highest_code_pass`: model with highest code_test_passed rate on Q24-Q26
  - `lowest_latency`: model with lowest avg latency_seconds
  - `lowest_resources`: model with lowest avg_cpu + avg_ram
  - `tradeoff_analysis`: text summary of quality-latency-resource tradeoffs
- `exercise_5`: full QUESTION → RETRIEVED CONTEXT → LLM RESPONSE chains for `exercise_5_candidate` questions, with `retrieval_outcome` classification per model
- `exercise_6`: multi-hop chain completeness for Q15–Q19 per model, with `multihop_sources_found` list showing which expected sources were actually retrieved

### List All Runs
```
GET /api/evaluate/runs
→ {"runs": [...]}
```

---

## 11. Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

RUN mkdir -p /app/data

EXPOSE 8003

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
```

---

## 12. `requirements.txt`

```
fastapi>=0.110.0
uvicorn>=0.29.0
pydantic>=2.7.0
httpx>=0.27.0
psutil>=5.9.0
```

No ML dependencies. All LLM calls go through Ollama HTTP. All RAG calls go through RAG service HTTP. No `pyyaml` needed since we call the ingestion API instead of parsing files directly.

---

## 13. Docker Compose Addition

Add under `services:` in `docker-compose.yml` (AFTER the `ui-service` block, BEFORE `volumes:`):

```yaml
  # 5. Evaluation Microservice
  evaluation-service:
    build:
      context: ./services/evaluation_service
      dockerfile: Dockerfile
    container_name: apicopilot-evaluation
    restart: unless-stopped
    ports:
      - "8003:8003"
    volumes:
      - eval_data:/app/data
    environment:
      - PORT=8003
      - HOST=0.0.0.0
      - OLLAMA_URL=http://172.31.112.1:11434
      - RAG_SERVICE_URL=http://rag-service:8001
      - INGESTION_SERVICE_URL=http://ingestion-service:8002
      - EVAL_MODEL_1=gemma3:4b
      - EVAL_MODEL_2=codellama:7b
      - EVAL_MODEL_3=starcoder2:3b
      - SCORING_MODE=keyword
      - JUDGE_MODEL=gemma3:1b
      - GPU_SAMPLING=none
      - DB_PATH=/app/data/evaluation.db
      - RESOURCE_POLL_INTERVAL=0.5
      - PYTHONUNBUFFERED=1
    depends_on:
      rag-service:
        condition: service_healthy
      ingestion-service:
        condition: service_healthy
    networks:
      - apicopilot-net
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8003/health')\""]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s
```

Add `eval_data` to the **existing** `volumes:` block at the bottom of `docker-compose.yml`:
```yaml
volumes:
  rag_data:
    driver: local
  eval_data:
    driver: local
```

**Key decisions:**
- `depends_on` only lists `rag-service` and `ingestion-service` — NOT the orchestrator (the evaluation service never calls it)
- `GPU_SAMPLING=none` by default — avoids nvidia-smi failures. To enable GPU metrics, add `deploy.resources.reservations.devices` block (same as rag-service) and set `GPU_SAMPLING=nvidia-smi`
- No `/workspace` volume mount needed — the evaluation service calls APIs, it doesn't read dataset files directly
- `eval_data` named volume persists the SQLite database across container restarts for resume support

---

## 14. Implementation Order

Implement in this exact order to avoid dependency issues:

1. **RAG Service Modification** (§2) — add `source`/`endpoint`/`api_title` fields to search results
2. `app/__init__.py` — empty file
3. `app/config.py` — all env vars (§5)
4. `app/questions.py` — hardcode all 26 Q bank entries from `plans/dataset_augmentation_plan.md` §6
5. `app/corpus_loader.py` — call ingestion API, build `CORPUS_ENDPOINTS` frozenset (§8)
6. `app/storage.py` — SQLite schema, all CRUD functions, resume query (§6)
7. `app/metrics.py` — pure stateless metric functions (§7)
8. `app/judge.py` — correctness scorer with keyword/LLM adapter (§7.5)
9. `app/evaluator.py` — full single-(question, model) evaluation pipeline (§9)
10. `app/main.py` — FastAPI routes, background task launcher, startup hooks (§10)
11. `Dockerfile` + `requirements.txt` (§11, §12)
12. Update `docker-compose.yml` (§13)

---

## 15. Key Implementation Constraints

1. **Identical prompt** — Prompt template in `evaluator.py` must be byte-for-byte identical to `services/orchestrator_service/app/main.py` lines 202–211. Do NOT modify the orchestrator.

2. **Non-streaming Ollama call** — Always use `"stream": false` so `prompt_eval_count` and `eval_count` are in the single response object.

3. **Immediate atomic write** — Every `(question, model)` result is written in a `BEGIN IMMEDIATE` SQLite transaction before proceeding to the next pair. No batching.

4. **Resume detection** — Build skip-set before starting any generation. Pairs processed in deterministic order: Q1→Q26 outer, model_1→model_3 inner.

5. **Corpus endpoint set** — Loaded at startup by calling `POST {INGESTION_SERVICE_URL}/api/parse-dataset`. The `endpoint` field from each returned chunk is added to `CORPUS_ENDPOINTS`. Do NOT copy the ingestion chunker code.

6. **RAG response key names** — The RAG service returns `"bm25"`, `"dense"`, `"cross_encoder"`, `"candidate_count"`. NOT `"bm25_results"`, NOT `"cross_encoder_results"`, NOT `"combined_context"`. There is no `combined_context` — the evaluation service builds context itself.

7. **RAG score is a string** — The `"score"` field in each RAG result is a formatted string like `"BM25: 3.42"` or `"Logit: 3.1234"`, NOT a float. Parse it if numeric comparison is needed: `float(score_str.split(": ")[1])`.

8. **Top-3 for context, top-5 for analysis** — Use top-3 CE results to build the prompt context (matching orchestrator behavior). Use all returned CE results (up to top-5) for retrieval quality classification and multi-hop analysis.

9. **Code question regex** — Always use `re.DOTALL` flag: `re.findall(r'```python\n(.*?)```', response, re.DOTALL)`.

10. **Exercise 5 candidates** — `exercise_5_candidate=True` for: Q4 (escalation flow), Q8 (two-file cross-ref refund), Q12 (two-file gateway exclusion), Q20 (decoy), Q21 (cross-domain refund). These are included in full QUESTION→CONTEXT→RESPONSE trace in the report.

11. **Exercise 6 candidates** — `exercise_6_multihop=True` for: Q15, Q16, Q17, Q18, Q19 (all multi-hop questions requiring 3+ source files). `multihop_chain_complete=1` only if ALL `expected_sources` appear in CE results' `source` fields.

12. **No ML dependencies** — `sentence-transformers`, `chromadb`, `torch`, `numpy`, `rank-bm25`, `scikit-learn` must NOT be in `requirements.txt`. All embeddings go through RAG service HTTP API. All parsing goes through ingestion service HTTP API.

13. **GPU sampling defaults to off** — `GPU_SAMPLING` defaults to `"none"`. Users who have NVIDIA Container Toolkit properly configured can set `GPU_SAMPLING=nvidia-smi` and add the NVIDIA runtime/device reservation to the docker-compose.

14. **Embedding model reference** — The RAG service uses `BAAI/bge-small-en-v1.5` (NOT `all-MiniLM-L6-v2`). The cross-encoder is `cross-encoder/ms-marco-MiniLM-L-6-v2`. These are only relevant for documentation purposes — the evaluation service does not load these models.

15. **Docker-compose service names** — Use hyphens: `rag-service`, `ingestion-service`, `orchestrator-service`. These match the existing `docker-compose.yml`. The evaluation service is `evaluation-service`.

---

## 16. Verification Checklist

After implementation, verify:

- [ ] RAG service modification deployed — `POST /api/search` results now include `source`, `endpoint`, `api_title` fields
- [ ] All 3 models pulled in Ollama: `gemma3:4b`, `codellama:7b`, `starcoder2:3b`
- [ ] `GET /health` returns healthy with `corpus_endpoints_loaded > 0`
- [ ] `POST /api/evaluate/run` starts a run and returns immediately
- [ ] `GET /api/evaluate/status/{run_id}` shows progress incrementing
- [ ] After completion, `GET /api/evaluate/report/{run_id}` returns all 6 exercise sections
- [ ] Restarting the container with the same `run_id` resumes from last completed pair
- [ ] `retrieval_quality` field is correctly populated (not all "wrong" due to missing source metadata)
- [ ] Exercise 5 trace shows actual source file names in retrieved contexts
- [ ] Exercise 6 multi-hop analysis shows which expected sources were/weren't found
