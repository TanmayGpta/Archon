# Archon Codebase Map

Quick-lookup index of the Archon repo. Read this before searching the tree.
Generated 2026-10-21 from commit `b134198`. Line numbers are approximate and drift as files change; re-verify before editing.

---

## 1. What the repo is

Archon = two halves joined by one schema:

1. **Generation (ArcGen)**: SRS text -> requirement elicitation (Phase A) -> ATAM pattern matching + node/edge generation (Phase B) -> architecture graph (JSON / Mermaid / PlantUML).
2. **Conformance**: real Python codebase -> AST import extraction -> networkx dependency graph -> layer classification (heuristic or LLM) -> rule check against a ruleset -> violation report + health score.
3. **Copilot IDE** (`copilot_ide/`): Next.js web IDE + FastAPI microservices (RAG, ingestion, orchestrator, evaluation) that wrap both halves plus an API-docs RAG copilot and a code agent.

Shared contract: `shared/schema.py` (`Layer`, `DependencyRule`, `ArchitectureRuleset`, Pydantic).

---

## 2. "Where is X?" lookup

| Need | Go to |
|---|---|
| Ruleset schema (layers, allowed deps) | `shared/schema.py` |
| `archon` CLI (`check`, `self-check`, `generate`) | `shared/cli/main.py` (entry `cli()`, registered in `pyproject.toml` `[project.scripts]`) |
| CLI usage cheat sheet | `cli_commands.txt` |
| Preset blueprints (clean, mvc, layered, archon) | `shared/fixtures/*.json`; loaded by `conformance/studio/blueprints.py` |
| Extract imports from Python files (AST) | `conformance/extraction.py` |
| Build dependency graph / find cycles / `STDLIB_MODULES` | `conformance/graph.py` |
| LLM layer classification of modules | `conformance/classifier_agent.py` (`classify_modules`, `get_llm`) |
| Heuristic (offline) layer classification | `conformance/studio/service.py` (`heuristic_layer_classify`, `match_layer_by_patterns`) |
| Violation check + health score + XAI explanation | `conformance/checker.py` (`check_architecture`, `ConformanceReport`, `get_xai_details`) |
| Interactive HTML conformance report | `conformance/visualize.py` (`generate_interactive_html`) |
| Conformance REST API (FastAPI router) | `conformance/studio/api.py` (`/blueprints`, `/audit`, `/workspace-info`) |
| Streamlit conformance dashboard | `app.py` (`streamlit run app.py`) |
| CI self-audit (dogfooding) | `.github/workflows/conformance.yml` |
| Demo codebase for conformance tests | `test_codebases/ecommerce_platform/` (clean-arch layers: presentation / application / domain / infrastructure) |
| ArcGen LLM clients (OmniKey, Groq, Ollama, fallback chain) | `generation/ArcGen/llm.py` (`get_llm_client`, `ResilientLLMClient`) |
| ArcGen env keys | `generation/ArcGen/.env.example` (OMNIKEY_*, GROQ_*, Ollama) |
| SRS -> architecture pipeline entry | `generation/ArcGen/generator.py` (`generate_architecture_from_srs`) |
| ArcGen CLI | `generation/ArcGen/main.py`; demo `run_demo.py` |
| Phase A elicitation agent / ASR coverage / terminal UI | `generation/ArcGen/phase_a/{elicitation_agent,asr_tracker,interactive_cli}.py` |
| Phase B normalize SRS -> ISO 25010 requirements | `generation/ArcGen/phase_b/normalizer.py` |
| ATAM pattern scoring + tradeoff table | `generation/ArcGen/phase_b/pattern_matcher.py` |
| Node gen (pass 1) / edge gen (pass 2) / orphan fixing | `generation/ArcGen/phase_b/{node_generator,edge_generator}.py` |
| Edge + citation validation | `generation/ArcGen/phase_b/edge_validator.py` |
| Architecture pattern knowledge base (20 patterns) | `generation/ArcGen/knowledge_base/patterns/*.json`; loader `knowledge_base/loader.py` (`PatternCatalog`) |
| ArcGen Pydantic schemas | `generation/ArcGen/schemas/` (`requirements.py` ISO 25010, `architecture.py` graph, `patterns.py`, `elicitation.py`) |
| ArcGen design rationale | `generation/ArcGen/why-this-approach.md`, `project-vision-srs-to-architecture.md` |
| ArcGen tests | `generation/ArcGen/tests/` (pytest) |
| Sample ArcGen outputs | `generation/ArcGen/*_architecture.{json,mmd,puml}`, `architecture_output.*` |
| Orchestrator gateway (all frontend calls go here) | `copilot_ide/services/orchestrator_service/app/main.py` |
| Agent chat logic (code agent, diff edits) | orchestrator `main.py` ~L950 `agent_chat`, ~L1286 `apply_agent_edit` |
| Web terminal backend | orchestrator `main.py` ~L416 `terminal_exec` |
| Workspace file CRUD / tree / open project | orchestrator `main.py` ~L294-L950 |
| Code knowledge graph (cached SCIP graph) | orchestrator `main.py` ~L500 `load_cached_knowledge_graph`, `/api/workspace/graph`, `/api/workspace/index-codebase`; cache file `copilot_ide/knowledge_graph.json` |
| Cloud API key storage/test | orchestrator `main.py` ~L1311-L1459 |
| GitHub open/save/fork repo | `copilot_ide/services/orchestrator_service/app/github_workspace.py` + routes in orchestrator `main.py` ~L695 |
| Suggest context files for agent | `.../orchestrator_service/app/context_suggester.py` |
| Code flow tracing ("how does X flow") | `.../orchestrator_service/app/flow_tracer.py` |
| ArcGen HTTP API | `.../orchestrator_service/app/arcgen_router.py` (mounted at `/api/arcgen`) |
| Conformance HTTP API in IDE | `.../orchestrator_service/app/conformance_router.py` (mounted at `/api/conformance`, wraps `conformance/studio/api.py`) |
| Hybrid search (BM25 + Chroma dense + cross-encoder rerank) | `copilot_ide/services/rag_service/app/search_engine.py` |
| Chunk OpenAPI / Postman / Markdown | `copilot_ide/services/ingestion_service/app/chunker.py` |
| SCIP-style code symbol extraction | `copilot_ide/services/ingestion_service/app/scip_extractor.py` (`SCIPExtractor`) |
| RAG evaluation runs (26 questions) | `copilot_ide/services/evaluation_service/app/` (`evaluator.py`, `questions.py`, `metrics.py`, `judge.py`, `storage.py` SQLite) |
| SCIP ablation benchmark | `evaluation_service/app/ablation_runner.py`, `codebase_questions.py`; seed `copilot_ide/scripts/seed_ablation_report.py`; output `copilot_ide/ablation_report_scip.json` |
| R2A architecture benchmark (SRS -> UML scoring) | `evaluation_service/app/R2ABENCH/` (`Evaluation/*.py`, `Dataset/{JAVA,Python}/<project>/`) |
| RAG ground-truth corpus (API specs, guides) | `copilot_ide/dataset/` (generated by `scripts/b2b_dataset_generator.py`) |
| Docker stack / ports / env | `copilot_ide/docker-compose.yml` |
| Frontend root page + mode switch | `copilot_ide/frontend/src/app/page.tsx` |
| Frontend ArcGen UI | `frontend/src/app/components/ArcGenStudio.tsx`, `ArchitectureDiagramViewer.tsx`, `AtamTradeoffMatrixView.tsx` |
| Frontend Conformance UI | `frontend/src/app/components/conformance/{ConformanceStudio,ConformanceCanvas}.tsx`, `types.ts` |
| Frontend evaluation dashboard | `frontend/src/app/components/EvaluationDashboard.tsx` + `components/evaluation/*` |
| Frontend code graph visualizer | `frontend/src/app/components/CodeKnowledgeGraph.tsx` |

---

## 3. Root files

| File | Purpose |
|---|---|
| `README.md` | Project overview, usage, structure. Mentions `docs/` but that folder does not exist. |
| `app.py` | Streamlit conformance dashboard (`render_violation_card_html`). |
| `cli_commands.txt` | `archon` CLI cheat sheet (flags, providers, CI thresholds). |
| `pyproject.toml` | Package `archon-cli`; script `archon = shared.cli.main:cli`; packages `shared`, `conformance`, `generation`. |
| `requirements.txt` | Root Python deps. |
| `.env` | Local secrets (untracked). Do not print. |
| `.streamlit/config.toml` | Streamlit theme. |
| `.github/workflows/conformance.yml` | CI: `pip install -e .` then `archon self-check -o audit_report.md` / `.pdf`, uploads artifacts. |

---

## 4. `shared/`

| File | Purpose |
|---|---|
| `schema.py` | `Layer`, `DependencyRule`, `ArchitectureRuleset` (Pydantic contract between generation and conformance). |
| `cli/main.py` | Click CLI. `check_command`, `self_check_command`, `generate_command`; helpers `resolve_layer_mapping`, `detect_default_provider`, `export_report` (md/html/pdf), `resolve_ruleset_path` (blueprint shortcuts `clean`, `mvc`, `archon`, `3tier`). |
| `fixtures/*.json` | Blueprint rulesets: `archon_architecture`, `clean_architecture`, `layered_architecture`, `mvc_architecture`. |

---

## 5. `conformance/`

Pipeline order: `extraction` -> `graph` -> `classifier_agent` (or heuristic in `studio/service.py`) -> `checker` -> `visualize`.

| File | Purpose |
|---|---|
| `extraction.py` | `extract_imports_from_file`, `extract_project_dependencies` (AST walk). |
| `graph.py` | `build_dependency_graph` (networkx), `find_cycles`, `STDLIB_MODULES`. |
| `classifier_agent.py` | LLM maps modules to layers (`ModuleClassification`, `classify_modules`). |
| `checker.py` | `check_architecture` -> `ConformanceReport` of `ArchitecturalViolation`s; `get_xai_details` explanations. |
| `visualize.py` | `generate_interactive_html` standalone report. |
| `studio/service.py` | `ConformanceService`: full audit orchestration, heuristic classify, path normalize (Docker/Windows). |
| `studio/blueprints.py` | `load_available_blueprints`, `get_blueprint_by_id` (reads `shared/fixtures`). |
| `studio/api.py` | FastAPI router: `GET /blueprints`, `POST /audit`, `GET /workspace-info`. |
| `README.md` | Conformance docs. |

---

## 6. `generation/ArcGen/` (canonical ArcGen)

| Path | Purpose |
|---|---|
| `__init__.py` | Re-exports `generate_architecture_from_srs`, LLM clients. |
| `generator.py` | Phase B pipeline: normalize -> match patterns -> nodes -> edges -> validate. |
| `llm.py` | `BaseLLMClient`, `OmniKeyClient`, `GroqClient`, `OllamaClient`, `ResilientLLMClient` (tiered fallback), `safe_parse_json`, `get_llm_client`. |
| `main.py` | CLI entry. |
| `run_demo.py` | End-to-end demo on benchmark SRS. |
| `test_prompt_elicitation.py` | Phase A demo script (not a pytest test). |
| `phase_a/asr_tracker.py` | `ASRTracker`, `CategoryState`, `DEFAULT_ASR_WEIGHTS`; computed stopping rules. |
| `phase_a/elicitation_agent.py` | `ElicitationAgent` conversational question loop; `normalize_suggested_options`. |
| `phase_a/interactive_cli.py` | Terminal elicitation UI. |
| `phase_b/normalizer.py` | `normalize_srs` -> `SRSDocument`. |
| `phase_b/pattern_matcher.py` | `match_patterns` deterministic ATAM scoring, disqualifications, `format_tradeoff_table`. |
| `phase_b/node_generator.py` | `generate_nodes` (pass 1). |
| `phase_b/edge_generator.py` | `generate_edges` (pass 2), `_connect_orphan_nodes`. |
| `phase_b/edge_validator.py` | `validate_architecture` -> `ValidationReport`. |
| `schemas/requirements.py` | ISO/IEC 25010 enums, `NormalizedRequirement`, `SRSDocument`. |
| `schemas/architecture.py` | `NodeType`, `EdgeType`, `ArchNode`, `ArchEdge`, `ArchitectureGraph` (+ Mermaid/PlantUML export). |
| `schemas/patterns.py` | `PatternProfile`, `PatternImpactProfile`, `TradeoffEvaluation`, etc. |
| `schemas/elicitation.py` | `QuestionItem`, `ExtractedASR`, `ElicitationTurn`. |
| `knowledge_base/loader.py` | `PatternCatalog`, `get_catalog`. |
| `knowledge_base/patterns/*.json` | 20 pattern profiles (microservices, cqrs, hexagonal, saga_*, strangler_fig, ...). |
| `tests/test_*.py` | pytest: asr_tracker, catalog, edge_validator, llm, pattern_matcher, phase_a_flow, schemas. |
| `.cache/srs_*.json` | Cached LLM SRS normalizations. |
| `C2C.txt` | Sample SRS input. |

**Duplicate warning:** `copilot_ide/services/arcgen/` is a near-copy of `generation/ArcGen/`. It uses CRLF line endings, and its `llm.py` also reads `DEFAULT_MODEL` / `OLLAMA_URL` env vars. The orchestrator imports `services.arcgen.*` (the copilot copy), not `generation/ArcGen`. Changes to ArcGen logic usually need to land in both copies.

---

## 7. `copilot_ide/`

### 7.1 Docker stack (`docker-compose.yml`)

| Service | Port | Source | Notes |
|---|---|---|---|
| `orchestrator-service` | 8000 | `services/orchestrator_service` | Gateway. Mounts `copilot_ide` as `/workspace`, `../conformance` and `../shared` read-only. Ollama at `host.docker.internal:11434`, model `gemma3:4b`. |
| `rag-service` | 8001 | `services/rag_service` | Embeddings `BAAI/bge-small-en-v1.5`, reranker `cross-encoder/ms-marco-MiniLM-L-6-v2`. Volume `rag_data`. |
| `ingestion-service` | 8002 | `services/ingestion_service` | Mounts `./dataset` read-only. |
| `evaluation-service` | 8003 | `services/evaluation_service` | Frontend `AblationTab.tsx` calls it directly at `localhost:8003`. |
| `ui-service` | 3000 | `frontend` (`Dockerfile.dev`) | `NEXT_PUBLIC_API_URL=http://localhost:8000`. |

### 7.2 Orchestrator (`services/orchestrator_service/app/`)

| File | Purpose |
|---|---|
| `main.py` (~1460 lines) | Gateway app. Mounts `arcgen_router` at `/api/arcgen` and `conformance_router` at `/api/conformance`. Routes: `/health`; RAG proxy `/api/database`, `/api/search`, `/api/upload`, `/api/generate`; workspace `/api/workspace/{projects,open-project,tree,all-files,file,create,delete,rename,graph,index-codebase}`; `/api/terminal/exec`; agent `/api/agent/{chat,suggest-files,apply-edit}`; GitHub `/api/github/{open-repo,file,save,fork}`; keys `/api/cloud/keys[/clear|/test]`; `/api/models`. |
| `arcgen_router.py` | `GET /patterns`, `GET /examples`, `POST /elicit/start`, `POST /elicit/answer`, `POST /generate`, `POST /save-to-workspace`. Holds elicitation sessions. |
| `conformance_router.py` | `GET /status`; includes `conformance/studio/api.py` routes. |
| `context_suggester.py` | `suggest_context_files`, `extract_suggestions`. |
| `flow_tracer.py` | `FlowTracer`, `is_flow_query`; traces call flows over the knowledge graph. |
| `github_workspace.py` | `GitHubWorkspaceClient` (GitHub REST). |
| `config.py` | Env config. |

### 7.3 RAG service (`services/rag_service/app/`)

| File | Purpose |
|---|---|
| `main.py` | `/health`, `POST /api/search`, `POST /api/ingest`, `POST /api/sync`, `GET /api/database`, `POST /api/database/clear-scip-chunks`, `GET /api/database/chunk-stats`. |
| `search_engine.py` | `SearchEngine`: BM25 + ChromaDB + cross-encoder rerank. |
| `config.py` | Env config. |

### 7.4 Ingestion service (`services/ingestion_service/app/`)

| File | Purpose |
|---|---|
| `main.py` | `/health`, `POST /api/parse-file`, `POST /api/parse-dataset`, `POST /api/scip/index`. |
| `chunker.py` | `chunk_openapi_spec`, `chunk_postman_collection`, `chunk_markdown_doc`, `chunk_file_content`, `compute_chunk_hash`. |
| `scip_extractor.py` | `SCIPExtractor`: code symbols / defs / refs -> knowledge graph nodes and edges. |

### 7.5 Evaluation service (`services/evaluation_service/app/`)

| File | Purpose |
|---|---|
| `main.py` | `/api/evaluate/{run,status/{id},results/{id},runs,report/{id}}`, `/api/evaluate/ablation[/status/{id}|/report/{id}|/latest|/runs]`. |
| `evaluator.py` | `run_evaluation_task`, `evaluate_single_pair`, `sample_resources`. |
| `questions.py` | 26-question bank (`QuestionItem`). |
| `codebase_questions.py` | 10 codebase questions for SCIP ablation. |
| `ablation_runner.py` | SCIP vs baseline ablation (`run_full_ablation`, `generate_ablation_report_data`). |
| `metrics.py` | Relevance, hallucination detection, multihop, code test, aggregation. |
| `judge.py` | `score_correctness` (LLM judge + keyword fallback). |
| `storage.py` | SQLite runs/results/ablation tables. |
| `corpus_loader.py` | Loads corpus endpoints. |
| `R2ABENCH/` | Requirements-to-Architecture benchmark. `Evaluation/` has `data_loader`, `generator`, `uml_parser`, `arch_scorer`, `metrics_calculator`, `llm_judge`, `main.run_pipeline`. `Dataset/{JAVA,Python}/<proj>/` has `<proj>_C.md`, `<proj>_E.md` (requirement docs) and `AD/ad.wsd` (ground-truth PlantUML). |

### 7.6 Other `copilot_ide/` paths

| Path | Purpose |
|---|---|
| `backend/app/` | Legacy monolith backend (pre-microservices): `main.py`, `chunker.py`, `search_engine.py`. Likely unused by Docker stack. |
| `services/arcgen/` | ArcGen copy used by orchestrator (see duplicate warning in section 6). |
| `dataset/` | 21 RAG corpus files: OpenAPI YAML (stripe, twilio, slack, sendgrid, zendesk, payments_v2, order_management, alerting, github_webhooks), Postman JSON, Markdown guides. |
| `architecture/` | Sample generated architecture (B2B payment gateway) json/mmd/puml. |
| `scripts/` | `start_all.sh`, `run.sh`, `install_ollama.sh`, `config_ollama.sh`, `b2b_dataset_generator.py`, `dataset_generator.py`, `run_evaluation.py`, `seed_ablation_report.py`, `verify_api.py`, `verify_microservices.py`. |
| `test/` | Ad hoc scripts (not pytest): `run_rag_evaluation.py`, `verify_live_pipeline.py`, `verify_dataset_chunks.py`, `test_omnikey.py`, sample generated code `refund_slack.py`, `send_twilio_sms.py` (has a syntax error). |
| `plans/` | Design plans: dataset augmentation, evaluation frontend, evaluation service. |
| `knowledge_graph.json` | Cached code knowledge graph read by orchestrator. Large, auto-generated. Do not hand-edit. |
| `evaluation_report*.json`, `ablation_report_scip.json` | Generated benchmark outputs. |
| `LAB4_REPORT.md` | Lab write-up of evaluation. |
| `GEMINI.md` | Notes for the Gemini agent. |
| `example_api.yaml` | Sample OpenAPI spec. |

### 7.7 Frontend (`copilot_ide/frontend/`, Next.js + Tailwind)

`src/app/page.tsx` (~4600 lines) holds most UI. Key anchors:

| Line (approx) | Thing |
|---|---|
| 14 | `API_BASE` (`NEXT_PUBLIC_API_URL`, default `http://127.0.0.1:8000`) |
| 198-490 | Helpers: `detectTargetFilename`, `getFileIcon`, `parseDiffBlocks`, `applyDiffBlocks` (agent diff apply) |
| 491 | `CodeBlock` (copy / apply / create file buttons) |
| 646 | `FormattedMarkdown` |
| 745 | `RagPipeline` stage visualizer |
| 835 | `FileTreeNode` |
| 954 | `highlightCodeLine` syntax highlighter |
| 1027 | `VSCodeAgentIDE`: editor tabs, file tree, terminals, API keys, agent chat |
| 2003 | `handleSendAgentMessage` (calls `/api/agent/chat`) |
| 3593 | `Home` root. `appMode`: `'api_copilot' \| 'copilot_agent' \| 'evaluation' \| 'arcgen' \| 'conformance'` |
| 3689 | `streamModelGeneration` (API copilot generation) |
| 3889-3970 | Mode switcher buttons and view routing |

Components (`src/app/components/`):

| File | Purpose |
|---|---|
| `ArcGenStudio.tsx` | ArcGen UI: elicitation chat + generate + save (calls `/api/arcgen/*`). |
| `ArchitectureDiagramViewer.tsx` | Renders `ArchNode` / `ArchEdge` graph. |
| `AtamTradeoffMatrixView.tsx` | ATAM tradeoff matrix with score rationales. |
| `conformance/ConformanceStudio.tsx` | Conformance UI; calls `/api/conformance/audit`. |
| `conformance/ConformanceCanvas.tsx` | Layer/violation canvas visualization. |
| `conformance/types.ts` | Conformance TS types. |
| `CodeKnowledgeGraph.tsx` | Physics graph of code knowledge graph (`GraphNode`, `GraphEdge`, `FlowStep`). |
| `SourcegraphIndexDrawer.tsx` | Index codebase + search drawer (`/api/workspace/index-codebase`, `/api/search`). |
| `ContextFileChips.tsx` | Agent context file chips + suggestions. |
| `GitHubOpenModal.tsx` | Open GitHub repo (`/api/github/open-repo`). |
| `AutoForkPromptModal.tsx` | Fork prompt on save (`/api/github/fork`). |
| `EvaluationDashboard.tsx` | Evaluation tab shell. |
| `QualitativeAnalysisView.tsx` | R2ABench benchmark table in ArcGen "Qualitative Analysis" tab. Data hardcoded in `QUALITATIVE_BENCHMARK_DATA`; header hover tooltips come from `METRIC_INFO` (definitions taken from `R2ABENCH/Evaluation/`). |
| `evaluation/ExecutiveOverview.tsx`, `Exercise1Models` to `Exercise6MultiHop.tsx` | Lab 4 evaluation sections. |
| `evaluation/AblationTab.tsx` | SCIP ablation runner (direct calls to `localhost:8003`). |
| `evaluation/HallucinationExplainer.tsx`, `JsonDataModal.tsx` | Helpers. |
| `evaluation/evaluationData.ts`, `ablationReportData.{ts,json}` | Static evaluation data. |

Config: `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json`, `Dockerfile`, `Dockerfile.dev`. Agent notes: `frontend/AGENTS.md`, `frontend/CLAUDE.md`.

---

## 8. `test_codebases/ecommerce_platform/`

Toy clean-architecture app used as the conformance target. Layers: `presentation/` (api, routes, controllers, auth_middleware), `application/` (order_service, inventory_service), `domain/` (models, order_calculator, fraud_checker, payment_rule), `infrastructure/` (database, stripe_client, kafka_producer, audit_logger). Three imports deliberately break layer rules (marked `# VIOLATION`): `domain/fraud_checker.py` imports infrastructure, `domain/payment_rule.py` imports presentation, `presentation/order_routes.py` imports infrastructure.

---

## 9. Gotchas

- `__pycache__/*.pyc` files are committed under `conformance/` and `shared/`. Ignore them.
- Two ArcGen copies (section 6). Orchestrator uses `copilot_ide/services/arcgen`.
- Orchestrator runs in Docker with paths under `/workspace`. Path normalization lives in `normalize_workspace_path` (orchestrator `main.py` ~L294) and `normalize_target_path` (`conformance/studio/service.py`).
- `README.md` references `docs/`. That folder does not exist.
- `conformance_router.py` has a hardcoded fallback path `C:/Users/krish/OneDrive/Desktop/Archon`. If `conformance` fails to import, `GET /api/conformance/status` returns the traceback.
- ArcGen elicitation sessions live in memory (`SESSIONS` dict in `arcgen_router.py`). They are lost on restart.

## 10. Keeping this map current

Update this file when adding, moving, or deleting modules, routes, or services.
