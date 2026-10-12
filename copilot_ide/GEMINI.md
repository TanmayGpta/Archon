# 🌌 Archon Copilot & AI Agent IDE — Repository Knowledge Base & Context

> **Project:** Archon Copilot (`apiCopilot`)  
> **Status:** Lab 4 Benchmarking & Quantitative Evaluation Complete  
> **Stack:** Next.js 14 (App Router) • FastAPI Microservices • ChromaDB Dense Vector Store • Rank-BM25 Lexical Search • MS-Marco Cross-Encoder • Ollama Local GPU/CPU • Docker Compose  
> **Last Updated:** 2026-09-14

---

## 1. Executive Overview

**Archon Copilot** is a modular enterprise AI pair-programming environment and API integration engine designed to assist developers in exploring, querying, and synthesizing code against complex API specifications and architectural documentation.

The platform provides two primary interfaces:
1. **Archon RAG Studio:** Dual-stream hybrid retrieval (BM25 + ChromaDB Vector Search + MS-Marco Cross-Encoder Re-Ranking) with live 3-column diagnostic inspection and streaming answer generation with interactive citation badges.
2. **Archon Agent IDE:** A full-featured web-based pair-programming studio featuring multi-tab editing, line numbers, code folding, dirty state tracking (`● Unsaved`), live Git branch integration, interactive multi-terminal drawer, smart file detection, 1-click code application (`SEARCH/REPLACE` diffs or full files), workspace project switcher, and cloud LLM key management (OpenAI, Anthropic, Google Gemini).
3. **Evaluation Suite (Lab 4):** Automated benchmarking harness evaluating local LLMs (`gemma3:4b`, `codellama:7b`, `starcoder2:3b`) across a 26-question test suite using `qwen2.5:7b` as a local Chain-of-Thought (CoT) LLM-as-a-Judge at $0 API cost.

---

## 2. Microservices Architecture & Network Topology

```
                                  ┌───────────────────────────────────┐
                                  │      Next.js 14 Frontend          │
                                  │      http://localhost:3000        │
                                  └─────────────────┬─────────────────┘
                                                    │
                                                    ▼
                                  ┌───────────────────────────────────┐
                                  │   Orchestrator Gateway (:8000)    │
                                  │   FastAPI • Smart Model Router    │
                                  └───────┬──────────────┬────────────┘
                                          │              │
                   ┌──────────────────────┴──────┐       │
                   ▼                             ▼       ▼
    ┌─────────────────────────────┐   ┌───────────────────────────────┐
    │     RAG Service (:8001)     │   │   Ingestion Service (:8002)   │
    │  • Okapi BM25 Lexical Index │   │  • OpenAPI / Markdown Chunker │
    │  • ChromaDB Dense Vectors   │   │  • Dynamic Spec Ingestion     │
    │  • Cross-Encoder Re-Ranker  │   └───────────────────────────────┘
    └──────────────┬──────────────┘
                   │
                   ▼
    ┌─────────────────────────────┐   ┌───────────────────────────────┐
    │   Ollama Local GPU Server   │   │  Evaluation Service (:8003)   │
    │  (gemma3:4b, codellama, etc)│   │  • 26-Question Benchmark      │
    │    http://localhost:11434   │   │  • Qwen 2.5 7B CoT Judge      │
    └─────────────────────────────┘   └───────────────────────────────┘
```

### Microservices Summary Table

| Service Name | Port | Directory | Tech Stack | Role & Key Responsibilities |
|---|---|---|---|---|
| **`ui-service`** | `3000` | [`frontend/`](file:///D:/AIDeV/frontend) | Next.js 14, React, Tailwind CSS, Lucide Icons | Web UI hosting Archon RAG inspector, VS Code-style Agent IDE, and Evaluation Dashboard. |
| **`orchestrator-service`** | `8000` | [`services/orchestrator_service/`](file:///D:/AIDeV/services/orchestrator_service) | FastAPI, Uvicorn, HTTPX | Central gateway, workspace file explorer (`os.scandir`), terminal process execution, multi-turn agent chat, cloud LLM proxy, prompt synthesis. |
| **`rag-service`** | `8001` | [`services/rag_service/`](file:///D:/AIDeV/services/rag_service) | FastAPI, ChromaDB, SentenceTransformers, Rank-BM25 | Hybrid search pipeline combining Okapi BM25 and `BAAI/bge-small-en-v1.5` embeddings, re-ranked via `ms-marco-MiniLM-L-6-v2`. |
| **`ingestion-service`** | `8002` | [`services/ingestion_service/`](file:///D:/AIDeV/services/ingestion_service) | FastAPI, PyYAML, JSON | Semantic chunker for OpenAPI 3.0, Swagger 2.0, Postman Collections, and Markdown architecture guides with SHA-256 deduplication. |
| **`evaluation-service`** | `8003` | [`services/evaluation_service/`](file:///D:/AIDeV/services/evaluation_service) | FastAPI, HTTPX, psutil | Benchmark engine executing 78 evaluation runs across 3 candidate LLMs, scored by local `qwen2.5:7b` CoT Judge. |
| **`ollama`** | `11434` | Host / WSL2 | Local LLM Runtime | Serves `gemma3:4b`, `codellama:7b`, `starcoder2:3b`, `qwen2.5:7b` with GPU/CPU acceleration. |

---

## 3. Directory Layout & Key Modules

```text
D:\AIDeV\
├── dataset/                               # 21 Ground-Truth Documentation Files (83 Semantic Chunks)
│   ├── alerting_service_api.yaml          # OpenAPI: Alerting microservice (PagerDuty/Twilio/Slack alerts)
│   ├── api_error_codes.md                 # Architecture guide: Standard enterprise REST error codes
│   ├── api_gateway_routing.md             # Architecture guide: Gateway path prefix routing & exclusions
│   ├── billing_glossary.md                # Decoy / Hard negative: Conceptual business glossary
│   ├── checkout_architecture_guide.md     # Architecture guide: Distributed checkout & payment flow
│   ├── ci_cd_deployment_guide.md          # Architecture guide: GitHub actions, staging, production pipeline
│   ├── customer_support_workflow.md       # Architecture guide: Zendesk ticket triage & refund workflow
│   ├── github_webhooks_api.yaml           # OpenAPI: GitHub webhook event dispatch specifications
│   ├── global_security_policies.md        # Architecture guide: Auth schemes (Bearer, Basic, API keys)
│   ├── incident_response_workflow.md      # Architecture guide: Escalation trees & on-call rotations
│   ├── order_management_api.yaml          # OpenAPI: Orders lifecycle, line items, and fulfillment
│   ├── payments_v2.yaml                   # OpenAPI: Enterprise payment gateway v2
│   ├── sendgrid_swagger_2.json            # Swagger 2.0: SendGrid transactional email API
│   ├── sendgrid_v3.yaml                   # OpenAPI 3.0: SendGrid mail send & templates API
│   ├── slack_dev_guide.md                 # Developer guide: Slack webhooks & bot authentication
│   ├── slack_v1.yaml                      # OpenAPI: Slack chat.postMessage and channels
│   ├── stripe_full_openapi.yaml           # OpenAPI: Full Stripe charges & customers API
│   ├── stripe_v1.yaml                     # OpenAPI: Stripe payments, refunds, and tokens
│   ├── twilio_postman_collection.json     # Postman Collection v2: Twilio SMS endpoints
│   ├── twilio_v2010.yaml                  # OpenAPI: Twilio Messages & Accounts API
│   └── zendesk_tickets_api.yaml           # OpenAPI: Zendesk ticket creation & comments
├── frontend/                              # Next.js 14 Web Application
│   ├── src/app/
│   │   ├── components/
│   │   │   ├── EvaluationDashboard.tsx    # Lab 4 Benchmark Dashboard
│   │   │   └── evaluation/                # Evaluation subcomponents (ExecutiveOverview, Charts, etc.)
│   │   ├── globals.css                    # Styling and dark-mode themes
│   │   ├── layout.tsx                     # App layout root
│   │   └── page.tsx                       # Main Studio: RAG Explorer + Archon Agent IDE
│   ├── package.json
│   ├── Dockerfile.dev
│   └── Dockerfile
├── services/
│   ├── ingestion_service/                 # Parser & Chunker Microservice (:8002)
│   │   ├── app/
│   │   │   ├── chunker.py                 # OpenAPI, Postman, Markdown specialized parsers
│   │   │   ├── config.py                  # Environment config
│   │   │   └── main.py                    # Endpoints: /api/parse-file, /api/parse-dataset
│   │   └── Dockerfile
│   ├── rag_service/                       # Hybrid Retrieval Microservice (:8001)
│   │   ├── app/
│   │   │   ├── search_engine.py           # BM25 + ChromaDB + Cross-Encoder SearchEngine class
│   │   │   ├── config.py                  # Paths, models, collection settings
│   │   │   └── main.py                    # Endpoints: /api/search, /api/ingest, /api/database
│   │   └── Dockerfile
│   ├── orchestrator_service/              # Central Gateway & Agent Engine (:8000)
│   │   ├── app/
│   │   │   ├── config.py                  # URLs for RAG, Ingestion, Ollama, Models
│   │   │   └── main.py                    # File explorer, Terminal runner, Agent Chat, Cloud Keys
│   │   └── Dockerfile
│   └── evaluation_service/                # Benchmarking Microservice (:8003)
│       ├── app/
│       │   ├── config.py                  # Benchmark configuration
│       │   ├── corpus_loader.py           # Canonical endpoint loader (74 endpoints)
│       │   ├── evaluator.py               # 78-run execution orchestrator
│       │   ├── judge.py                   # Local Qwen 2.5 7B CoT Judge with JSON schema
│       │   ├── metrics.py                 # Correctness, Jaccard relevance, AST pass rate
│       │   ├── questions.py               # 26 benchmark question definitions
│       │   ├── storage.py                 # JSON report persistence
│       │   └── main.py                    # Endpoints: /api/evaluate/run, /api/evaluate/report
│       └── Dockerfile
├── scripts/                               # Operational Scripts
│   ├── b2b_dataset_generator.py           # Generator for synthetic OpenAPI / Guide corpora
│   ├── run_evaluation.py                  # CLI runner for evaluation benchmark
│   ├── start_all.sh                       # Native startup script for all services
│   ├── verify_api.py                      # Health and API sanity verification
│   └── verify_microservices.py            # Deep end-to-end integration tester
├── plans/                                 # Engineering Specifications & Lab Runbooks
│   ├── dataset_augmentation_plan.md       # Corpus design specification
│   ├── evaluation_frontend_plan.md        # UI design specification for eval dashboard
│   └── evaluation_service_plan.md         # Microservice specification for eval harness
├── docker-compose.yml                     # Unified multi-container orchestrator
├── evaluation_report_llm_judge.json       # Ground-truth 78-run benchmark results scored by Qwen 2.5 7B
├── LAB4_REPORT.md                         # Formal Lab 4 Benchmark Report & Analysis
└── README.md                              # Main public-facing documentation
```

---

## 4. Key Subsystems & Implementation Details

### 4.1 Hybrid RAG Engine (`services/rag_service`)
- **Lexical Stream:** `rank_bm25.BM25Okapi` performs exact token matching, crucial for technical identifiers like `/v1/refunds`, `chat.postMessage`, and `Idempotency-Key`.
- **Dense Vector Stream:** `SentenceTransformer("BAAI/bge-small-en-v1.5")` (384 dimensions) persisted in ChromaDB (`/app/data/chroma_db`).
- **Neural Cross-Encoder:** `CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")` evaluates `(query, document)` pairs, outputting calibrated logit scores.
- **Auto-Sync Guard:** In `search_engine.py`, the system verifies that ChromaDB contains $\ge 80$ chunks on boot. If fewer are present, it automatically triggers `/api/parse-dataset` from `ingestion-service`, clears obsolete chunks, and embeds the entire 21-file corpus.

### 4.2 Ingestion & Semantic Chunking (`services/ingestion_service`)
- **OpenAPI 3.x / Swagger 2.0:** Extracts endpoints, summaries, descriptions, query/path parameters, request bodies, and responses into structured semantic chunks tagged with endpoint verb and path.
- **Postman Collections:** Traverses nested item trees and maps requests, authorization headers, and bodies.
- **Architectural Markdown:** Chunks along `# ` and `## ` boundaries to preserve procedural steps and tables intact.
- **Fingerprinting:** Calculates 16-character SHA-256 hashes for deduplication.

### 4.3 Orchestrator & Agent IDE Gateway (`services/orchestrator_service`)
- **Workspace Navigation:** Fast directory traversal powered by `os.scandir`, filtered by `IGNORED_DIRS` (`.git`, `node_modules`, `venv`, etc.) with depth limits for responsiveness.
- **Path Resolution:** Normalizes paths across Windows host paths (`C:/...`, `D:/...`), WSL mounts (`/mnt/c/...`, `/mnt/d/...`), and Docker container roots (`/workspace`).
- **Terminal Execution:** Executes real asynchronous shell commands via `asyncio.create_subprocess_exec` with working directory tracking (`cd` command support) and a 45-second timeout safeguard.
- **Agent Chat & Surgical Editing:**
  - Injects top-3 re-ranked RAG citations and active editor file context into system prompts.
  - Distinguishes between new/empty files (requires full code snippet) and existing files with code (generates `<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE` diff blocks).
  - Supports local Ollama models (`gemma3:4b`, `codellama:7b`) and streaming cloud providers (OpenAI, Anthropic, Gemini).

### 4.4 Evaluation Benchmark Engine (`services/evaluation_service`)
- Evaluates 26 questions across 5 functional categories:
  1. *Group 1:* Single-file retrieval baseline (Q1–Q7)
  2. *Group 2:* Two-file cross-referencing (Q8–Q14)
  3. *Group 3:* Multi-file / multi-hop chaining $\ge 3$ sources (Q15–Q19)
  4. *Group 4:* Hard-negative decoy defense (Q20–Q23)
  5. *Group 5:* Production code synthesis with AST validation (Q24–Q26)
- **Scoring Pipeline:**
  - **Local CoT LLM-as-a-Judge:** Calls `qwen2.5:7b` with temperature `0.1`, strict JSON schema `{ "reason": "...", "score": 0.0-1.0 }`, and expected keyword anchors.
  - **Context Relevance:** Jaccard similarity over non-stopword sets: $\frac{|V_{\text{context}} \cap V_{\text{response}}|}{|V_{\text{context}} \cup V_{\text{response}}|}$.
  - **Endpoint Hallucination Rate:** Regex scanner against 74 canonical corpus endpoints dynamically extracted from OpenAPI specs.
  - **Code Pass Rate:** Python AST syntax compilation via `compile(code, '<string>', 'exec')` and functional assertions.

---

## 5. Lab 4 Benchmark Results & Key Insights

Scored across **78 evaluation pairs** (Run ID: `f2cd6546`) with the full 21-document corpus indexed:

| Benchmark Metric | `gemma3:4b` | `codellama:7b` | `starcoder2:3b` |
|---|:---:|:---:|:---:|
| **Average Factual Correctness** | **71.15%** | 45.83% | 32.12% |
| **Max / Min Correctness** | 1.00 / **0.50** | 1.00 / 0.00 | 1.00 / 0.00 |
| **Average Context Relevance** | **0.2228** | 0.1319 | 0.2209 |
| **Average Latency (s)** | 37.05s | 52.00s | **32.36s** |
| **Avg Completion Tokens** | 456.8 | **87.5** (Concise) | 871.5 (Runaway) |
| **Code AST Pass Rate (Q24–Q26)** | **66.7%** (2/3) | 0.0% (0/3) | 0.0% (0/3) |
| **Unrecognized Endpoint Flags** | 7 | **1** (Fidelity Win) | 6 |
| **Average CPU Utilization** | **4.08%** | 13.86% (47.1% peak) | 4.96% |
| **Primary Scoring Mode** | Local CoT (`qwen2.5:7b`) | Local CoT (`qwen2.5:7b`) | Local CoT (`qwen2.5:7b`) |

### Critical Discoveries & Root Causes Identified:
1. **The Vector Store Ingestion Gap:** Initial testing suffered from a 69.2% "wrong" retrieval rate because Docker volume `rag_data` held only 24 legacy chunks (10 files); 12 of the 21 active dataset files were missing. Once the startup check in `search_engine.py` was updated to auto-sync when chunks $< 80$, the "wrong" rate dropped from **69.2% $\rightarrow$ 0.0%**, and `gemma3:4b` correctness surged by **+23.07%**.
2. **The Parametric Illusion:** Before fixing the vector store, models scored ~40-48% on missing files purely by relying on pre-trained parametric weights (generic REST conventions), proving that end-to-end LLM metrics without retriever inspection mask critical pipeline failures.
3. **Model Selection Strategy:**
   - **`gemma3:4b`** is the recommended default general-purpose API Copilot model (dominates accuracy, relevance, and code synthesis with lowest CPU footprint).
   - **`codellama:7b`** is the high-fidelity champion (near-zero endpoint fabrication, ideal for strict security/compliance environments).
   - **`starcoder2:3b`** is suited for fast inline code autocomplete, but struggles with conversational RAG synthesis.

---

## 6. Development Workflow & Quickstart

### Starting the Stack via Docker Compose
```bash
# Build and launch all microservices in the background
docker compose up --build -d

# Verify container status
docker compose ps

# View streaming logs
docker compose logs -f orchestrator-service rag-service
```

### Running the Evaluation Harness
```bash
# Trigger full 26-question evaluation across all models via CLI
python scripts/run_evaluation.py

# Or query the Evaluation Service directly
curl -X POST http://localhost:8003/api/evaluate/run \
     -H "Content-Type: application/json" \
     -d '{"models": ["gemma3:4b", "codellama:7b", "starcoder2:3b"], "scoring_mode": "llm"}'
```

### Verifying Microservice Health
```bash
# Check all services via orchestrator
curl http://localhost:8000/health

# Check RAG collection status
curl http://localhost:8001/api/database
```

---

## 7. Current Project State & Next Milestones

### Completed Milestones
- [x] **Lab 1–3:** Microservices mesh established; hybrid BM25 + dense ChromaDB search; MS-Marco cross-encoder re-ranking; VS Code-style Agent IDE with multi-tab editor, live git branch, and terminal runner.
- [x] **Lab 4:** 21-document dataset (83 semantic chunks); 26-question multi-group benchmark; local `qwen2.5:7b` CoT LLM-as-a-Judge; vector store synchronization defect resolved (0% wrong rate); interactive frontend evaluation dashboard; comprehensive formal report (`LAB4_REPORT.md`).

### Active Uncommitted Changes
- `services/rag_service/app/search_engine.py`: Enhanced auto-sync threshold check (`count < 80`) with `clear_existing=True`.
- `evaluation_report_llm_judge.json` & `frontend/src/app/components/evaluation/evaluationData.ts`: Synchronized 78-run benchmark dataset scored by local Qwen 2.5 7B judge.
- `frontend/src/app/components/evaluation/ExecutiveOverview.tsx`: Updated aggregate metrics and narrative cards reflecting grounded run `f2cd6546`.
- `LAB4_REPORT.md`: Comprehensive documentation of evaluation findings and RAG transformation.

### Next Planned Horizon (Week 5)
- **Sourcegraph SCIP / Graph RAG Integration:** Replace flat vector similarity on multi-hop chains with deterministic Abstract Syntax Tree (AST) code dependency graph indexing.
- **Autonomous Agent Tool Calls:** Enable Archon Agent to autonomously invoke terminal tools, run tests, and self-correct syntax errors in a feedback loop.
