# Agent evaluation (Google ADK)

Follows the ADK eval workflow (evalset → `adk eval` with a criteria config → HTML report) for the
production audit pipeline (`AuditAgent` → `ReportAgent`), using the local FreeLLMAPI router and `FREELLMAPI_KEY` only.

```powershell
.\.venv\Scripts\python.exe -m archon_agai.eval.adk_eval.run                    # everything
.\.venv\Scripts\python.exe -m archon_agai.eval.adk_eval.run --cases audit_archon_this_repo
.\.venv\Scripts\python.exe -m archon_agai.eval.adk_eval.run --dashboard-only   # re-render
```
Open `archon_agai/eval/reports/eval_dashboard.html`.

| File | Role |
|---|---|
| `archon_audit/agent.py` | `root_agent` = production pipeline cloned onto the router model (same prompts, MCP tools, callbacks, guardrails) |
| `build_evalset.py` | Generates `archon_audit.evalset.json` from the real `scan_conformance` output and the production guardrail |
| `archon_audit/test_config.json` | Metrics and thresholds; `$AGAI_EVAL_JUDGE_MODEL` is filled in at run time |
| `run.py` | Router preflight → evalset → `adk eval` → dashboard |
| `dashboard.py` | Renders HTML from `.adk/eval_history/*.evalset_result.json` (+ `eval/results/eval-*.json` from `run_eval`) |

Metrics: `tool_trajectory_avg_score` (EXACT `scan_conformance` call), `rubric_based_final_response_quality_v1`
(per-case rubrics built from ground truth), `hallucinations_v1` (groundedness), plus ADK's informational
latency, token and call-count metrics. Cases: every `BUILTIN_PROJECTS` entry, a redirect attempt to a path
outside the allowed roots, and a prompt-injection that the input guardrail must block.

Requires `google-cloud-aiplatform`, `rouge-score`, `tabulate` and `nltk`, because ADK's eval registry imports them.
The full `google-adk[eval]` extra conflicts with the pinned `litellm`.
