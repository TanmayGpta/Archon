# Archon Project Rules (ported from Claude Code CLAUDE.md + project memories)

## Two projects in one repo

| Project | Branch | Where | What |
|---|---|---|---|
| **Archon** (main project) | `main` | everything except `archon_agai/` | Architecture generation (SRS → ruleset) + conformance checking (codebase → violations + health score) |
| **Archon AGAI** (Agentic AI course project) | `agai-dev` | `archon_agai/` (+ any agai-specific UI/service additions) | Agentic architectural guard + self-healing system built *on top of* Archon's conformance engine |

### Rules
- AGAI work happens on `agai-dev` only. Do not commit AGAI-specific code to `main`.
- AGAI **imports** Archon (`conformance/`, `shared/`); treat those as a dependency. If an AGAI feature needs a change in core Archon modules, flag it — that change likely belongs on `main` too (then merge `main` into `agai-dev`).
- Check `git branch --show-current` before committing.

## Archon Layout

- `conformance/` — deterministic engine. `extraction.py` (AST imports) → `graph.py` (NetworkX DiGraph, Tarjan cycles) → `checker.py` (rules vs. layer map → violations, health score). `classifier_agent.py` = LangChain LLM layer classifier (Groq/NVIDIA/Gemini/OpenAI/Qwen). `visualize.py` = vis-network HTML. `studio/` = FastAPI API for Conformance Studio.
- `copilot_ide/services/arcgen_service/` — ArcGen microservice (:8004, the only copy): SRS → architecture + ATAM tradeoffs (MAAD-inspired). Plain Python pipeline in `app/`, no LangGraph. Own venv `.venv` (py3.14).
- `shared/` — `schema.py` (Pydantic ruleset contract, import-linter style), `fixtures/` (e.g. `clean_architecture.json`), `cli/main.py` (`archon` CLI).
- `copilot_ide/` — Next.js frontend (`frontend/`) + FastAPI microservices (`services/`) via `docker-compose.yml`.
- `test_codebases/ecommerce_platform` — demo target with seeded violations.
- `app.py` — Streamlit dashboard.
- `kube-pred/` — runtime anomaly detection on Prometheus metrics. All work stays in this folder. Own venv `kube-pred/.venv`.
- `context/CODEBASE_MAP.md` — file-by-file index. **Read it first** when locating code. Update it when adding, moving, or deleting modules/routes.

## Core Philosophy
Graphs come from AST (never LLM); LLMs only for semantic classification; rules come from the JSON contract, not hardcoded.

## Commands

```bash
pip install -r requirements.txt && pip install -e .
archon self-check
archon check test_codebases/ecommerce_platform [-o audit_report.html]
streamlit run app.py
cd copilot_ide && docker compose up -d      # UI :3000, orchestrator :8000, rag :8001, ingestion :8002, eval :8003, arcgen :8004
python archon_agai/run_session.py           # AGAI ADK session (needs GOOGLE_API_KEY)
```

More CLI flags: `cli_commands.txt`. API keys live in root `.env` (never commit).

## Commit Rules
- **No AI attribution**: no `Co-Authored-By` trailers, no "Generated with AI" lines. Commit as the user's git identity only.
- user.email is set locally to `83057875+Gaurav-py-Ghosh@users.noreply.github.com` (GitHub blocks pushes with private email).

## Archon AGAI

Goal: audit Python codebases against Clean Architecture layer boundaries and auto-fix structural violations.

- **Ground truth = Archon core**: AST extraction → NetworkX graph → Tarjan cycles → layer conformance score.
- Full design + requirement mapping: `archon_agai/README.md`. Contracts: `archon_agai/schemas.py`.
- **ADK** (`agent.py`, `callbacks.py`): SequentialAgent → RemoteA2aAgent to healing crew. Tools via MCP.
- **CrewAI** (`healing/crew.py`, `healing/a2a_server.py`): Flow Architect → Specialist → Verifier with retry; A2A on :8101.
- `engine.py` = deterministic audit/verify (sandbox copy, anti-gaming guardrails). Verification is never an LLM judgement.
- Frontend: `copilot_ide/frontend/src/app/agai/` (route `/agai`).
- Offline tests: `.venv/bin/python -m pytest archon_agai/tests -q`.

## Project Context

### Three-Way Build Plan
Archon Copilot planned as three surfaces (web, Ink CLI, Electron-style IDE app) on one Dockerized microservice backend. Grilling paused at round 3. Decisions and open questions in Obsidian note `Ideas/Archon Copilot.md`. Don't implement until user confirms shared understanding.

### kube-pred Pipeline
AIOps module in `kube-pred/` for anomaly detection on Prometheus metrics. Meant as a real tool. Pipeline: architecture gen → conformance → auto-fix → auto-containerise → Kubernetes → kube-pred. Keep detection deterministic; LLM only explains.

### Local Runner
`archon` (or `archon runner`) starts a local aiohttp server on 127.0.0.1:7337. WebSocket PTY shell + GitHub token (OS keychain via `keyring`, else `~/.archon`). Code in `shared/runner/`.

### College DGX Cluster
- SSH: `dgx-s-bmu-soet-230798@10.1.0.176` (key auth with `~/.ssh/id_ed25519`; never use/store the password).
- GPUs via Kubernetes only: `bash -lc "module load kubernetes/BMU-Cluster; kubectl ..."`. Namespace `dgx-s-bmu-soet-230798-restricted`.
- Quota: 1× `nvidia.com/mig-2g.35gb` (35 GB MIG slice), 16 CPU, 32 Gi RAM.
- No StorageClass → use ephemeral pod storage + `kubectl cp`.

### Classifier Eval
Harness in `experiments/classifier_eval/`. Any new classifier candidate gets scored with `score.py` against `groq-prod-L0` before touching production. Fine-tuned Kev-9B checkpoints at `~/.cache/archon_clf/runs/archon-9b-L{0,1,2,3}`.
