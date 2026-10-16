# Archon Guard (AGAI)

An agentic architecture guard and self-healing system for Python codebases. Archon's deterministic engine
(AST → NetworkX → Tarjan → layer rules) is the ground truth. **Google ADK** audits and explains violations.
A **CrewAI** team, reached over **A2A**, writes Dependency Inversion patches that are verified in a sandbox
before a human applies them. The UI has two windows: the **Code Editor** and the **Conformance** canvas.

```
Next.js /agai  ── Code Editor | Conformance ──  SSE events
      │
FastAPI gateway (archon_agai/gateway.py, :8100)
      │
ADK  SequentialAgent[AuditAgent → ReportAgent]  ──MCP──► Archon Conformance MCP server (custom)
      │                                         ──MCP──► Filesystem MCP server (external, read-only)
      │  RemoteA2aAgent ── A2A JSON-RPC (HealingRequest → HealingReport)
      ▼
CrewAI Flow (archon_agai/healing, :8101)
   Chief Architect → Refactoring Specialist → Conformance Verifier
                         ▲──────── retry with feedback ───────┘   (max 3)
Langfuse (OpenTelemetry) traces both frameworks · JSONL event log in .runs/
```

## Requirement mapping

| # | Requirement | Where |
|---|---|---|
| 1 | Context sharing / state | ADK `session.state` (`audit_result`, `audit_narrative`, `usage`); ReportAgent reads `{audit_result}` via `output_key`; the A2A payload carries the state into CrewAI; CrewAI `Flow[HealState]` passes plan → patches → verification → retry feedback. |
| 2 | MCP tools (2+) | `mcp_server.py` (custom: `scan_conformance`, `detect_cycles`, `inspect_module`, `verify_patches`, `list_blueprints`) and `@modelcontextprotocol/server-filesystem` (external). Used by ADK (`McpToolset`) and CrewAI (`Agent(mcps=[MCPServerStdio])`). |
| 3 | Pydantic structured output | `schemas.py`. ADK `output_schema=AuditNarrative`; CrewAI `output_pydantic=HealingPlan / PatchSet / VerifierReport`; final Markdown report (`report.py`, `/api/agai/sessions/{id}/report.md`). |
| 4 | Design patterns | Sequential pipeline, tool use, planner → executor, evaluator–optimizer loop (Verifier → Specialist retry), human-in-the-loop apply/revert, remote delegation (A2A), deterministic oracle. |
| 5 | Callbacks / monitoring | ADK `before/after_agent`, `before/after_model` (token usage), `before/after_tool`, `on_tool_error` (`callbacks.py`); CrewAI `step_callback` / `task_callback`. All are streamed live to the UI (`events.py` → SSE). |
| 6 | A2A, ADK ↔ CrewAI | `healing/a2a_server.py` (a2a-sdk server, agent card at `/.well-known/agent-card.json`), consumed by ADK `RemoteA2aAgent` (`agent.py`). |
| 7 | Only ADK + CrewAI | Enforced by `tests/test_offline.py::test_only_adk_and_crewai_frameworks`. |
| 8 | Guardrails | `guardrails.py`. **Input:** prompt injection, toxicity and length checks (gateway + ADK `before_agent`). **Tools:** path sandboxing (`before_tool`) and Pydantic validation of tool output (`after_tool`). **Output:** CrewAI task guardrails reject patches that fail to parse, delete used imports, gut behaviour, remove public APIs or touch tests/rulesets; the Verifier's report must match the deterministic result. |
| 9 | Observability | Langfuse via OpenInference instrumentation for ADK and CrewAI (`observability.py`). Provenance: JSONL event log per session, with patch → violation ids → session in `applied` events. |
| 10 | Evaluation | `eval/run_eval.py`: detection precision/recall against `# VIOLATION` labels, heal success, regressions, attempts, guardrail block and false-positive rates, latency p50/p95, tokens and USD. |
| 11 | Cloud deploy | `deploy/Dockerfile` + `deploy/cloudrun.sh` (Cloud Run: `archon-gateway`, `archon-healing`); frontend on Vercel/Cloud Run. |

## Run locally

```powershell
# once
.venv\Scripts\python.exe -m pip install -r archon_agai\requirements.txt
# start the FreeLLMAPI desktop app (OpenAI-compatible router on :31415) and put FREELLMAPI_KEY
# (and optional LANGFUSE_*) in Archon\.env — see archon_agai\.env.example

# terminal 1: CrewAI healing crew (A2A)
.venv\Scripts\python.exe -m archon_agai.healing.a2a_server
# terminal 2: gateway (ADK + MCP + API)
.venv\Scripts\python.exe -m uvicorn archon_agai.gateway:app --port 8100
# terminal 3: frontend
cd copilot_ide\frontend; npm run dev      # open http://localhost:3000/agai

# tests (no API key needed) / evaluation (needs both services running)
.venv\Scripts\python.exe -m pytest archon_agai\tests -q
.venv\Scripts\python.exe -m archon_agai.eval.run_eval --variants 5
```

Healing never edits your files directly. Patches are applied to a sandbox copy and verified first. **Apply**
re-verifies them against the current files and backs up the originals, and **Revert** restores them.
