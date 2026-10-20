# CLAUDE.md

Private working notes for Claude Code (gitignored — not shared with the team).

## Two projects in one repo

| Project | Branch | Where | What |
|---|---|---|---|
| **Archon** (main project) | `main` | everything except `archon_agai/` | Architecture generation (SRS → ruleset) + conformance checking (codebase → violations + health score) |
| **Archon AGAI** (Agentic AI course project) | `agai-dev` | `archon_agai/` (+ any agai-specific UI/service additions) | Agentic architectural guard + self-healing system built *on top of* Archon's conformance engine |

Rules:
- AGAI work happens on `agai-dev` only. Do not commit AGAI-specific code to `main`.
- AGAI **imports** Archon (`conformance/`, `shared/`); treat those as a dependency. If an AGAI feature needs a change in core Archon modules, flag it — that change likely belongs on `main` too (then merge `main` into `agai-dev`).
- Check `git branch --show-current` before committing.

## Archon layout

- `conformance/` — deterministic engine. `extraction.py` (AST imports) → `graph.py` (NetworkX DiGraph, Tarjan cycles) → `checker.py` (rules vs. layer map → violations, health score). `classifier_agent.py` = LangChain LLM layer classifier (Groq/NVIDIA/Gemini/OpenAI/Qwen). `visualize.py` = vis-network HTML. `studio/` = FastAPI API for Conformance Studio.
- `generation/ArcGen/` — SRS → architecture + ATAM tradeoffs (MAAD-inspired, LangGraph).
- `shared/` — `schema.py` (Pydantic ruleset contract, import-linter style), `fixtures/` (e.g. `clean_architecture.json`), `cli/main.py` (`archon` CLI).
- `copilot_ide/` — Next.js frontend (`frontend/`, has its own CLAUDE.md/AGENTS.md: non-standard Next.js version, read `node_modules/next/dist/docs/` before writing Next code) + FastAPI microservices (`services/`: orchestrator, rag, ingestion, evaluation, arcgen) via `docker-compose.yml`.
- `test_codebases/ecommerce_platform` — demo target with seeded violations.
- `app.py` — Streamlit dashboard.

Core philosophy: graphs come from AST (never LLM); LLMs only for semantic classification; rules come from the JSON contract, not hardcoded.

## Commands

```bash
pip install -r requirements.txt && pip install -e .
archon self-check
archon check test_codebases/ecommerce_platform [-o audit_report.html]
streamlit run app.py
cd copilot_ide && docker compose up -d      # UI :3000, orchestrator :8000, rag :8001, ingestion :8002, eval :8003
python archon_agai/run_session.py           # AGAI ADK session (needs GOOGLE_API_KEY)
```
More CLI flags: `cli_commands.txt`. API keys live in root `.env` (never commit).

## Archon AGAI

Goal: audit Python codebases against Clean Architecture layer boundaries and auto-fix structural violations.

- **Ground truth = Archon core**: AST extraction → NetworkX graph → Tarjan cycles → layer conformance score.
- Full design + requirement mapping: `archon_agai/README.md`. Contracts: `archon_agai/schemas.py` (change deliberately).
- **ADK** (`agent.py`, `callbacks.py`): SequentialAgent[AuditAgent → ReportAgent] + `RemoteA2aAgent` to the healing crew. Tools come via MCP (`mcp_server.py` custom + filesystem MCP).
- **CrewAI** (`healing/crew.py`, `healing/a2a_server.py`): Flow Architect → Specialist → Verifier with retry; served over A2A (a2a-sdk v1) on :8101.
- `engine.py` = deterministic audit/verify (sandbox copy, anti-gaming guardrails in `guardrails.py`, import smoke test). Verification is never an LLM judgement.
- `gateway.py` (:8100) mounts `conformance.studio.api` at `/api/conformance` so `ConformanceStudio` is reused unchanged; AGAI endpoints under `/api/agai/*`, SSE events.
- Frontend: `copilot_ide/frontend/src/app/agai/` (route `/agai`), only 2 windows: Code Editor + Conformance. Env `NEXT_PUBLIC_AGAI_API_URL`.
- Offline tests: `.venv\Scripts\python.exe -m pytest archon_agai/tests -q`. Python env is the repo `.venv` (py 3.13).
- Original prototype kept in `archon_agai/_legacy/`.
- Core-Archon changes made on agai-dev that should also go to `main`: `conformance/studio/service.py` heuristic (layer-named package wins), `ConformanceStudio.tsx` optional `initialBlueprintId` prop.
