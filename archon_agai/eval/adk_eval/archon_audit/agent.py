"""Agent under evaluation: the production ADK audit pipeline (AuditAgent -> ReportAgent), cloned so that
both LlmAgents use the local FreeLLMAPI router. Instructions, MCP tools, callbacks and guardrails are the
production objects; only the model endpoint differs. No Ollama fallback, so scores reflect the router model.

    adk eval archon_agai/eval/adk_eval/archon_audit <evalset> --config_file_path <config>
(use `python -m archon_agai.eval.adk_eval.run`, which also builds the evalset and the dashboard)
"""
import os
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[4]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

from google.adk.models.lite_llm import LiteLlm  # noqa: E402

from archon_agai.agent import audit_agent, audit_pipeline, report_agent  # noqa: E402
from archon_agai.eval.adk_eval import settings  # noqa: E402

settings.apply_judge_env()

eval_llm = LiteLlm(
    model=settings.litellm_id(settings.EVAL_MODEL),
    api_base=settings.EVAL_BASE_URL,
    api_key=settings.EVAL_LLM_KEY or "missing",
    timeout=float(os.getenv("AGAI_EVAL_LLM_TIMEOUT_S", "90")),
    num_retries=int(os.getenv("AGAI_EVAL_LLM_MAX_RETRIES", "1")),
)

root_agent = audit_pipeline.clone(update={"sub_agents": [
    audit_agent.clone(update={"model": eval_llm}),
    report_agent.clone(update={"model": eval_llm}),
]})
