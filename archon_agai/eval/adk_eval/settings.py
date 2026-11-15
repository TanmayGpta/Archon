"""Eval-only LLM settings. The eval always talks to the local FreeLLMAPI router with FREELLMAPI_KEY;
hosted keys (OPENROUTER_KEY, Groq, AGAI_LLM_BASE_URL used by the deployed site) are never read here.

Overrides (Archon/.env or the shell):
  AGAI_EVAL_LLM_BASE_URL   default http://127.0.0.1:31415/v1
  AGAI_EVAL_MODEL          model id served by the router for the agents under test (default: auto)
  AGAI_EVAL_JUDGE_MODEL    model id for the LLM-as-judge metrics (default: same as AGAI_EVAL_MODEL)
"""
import os
from pathlib import Path

import archon_agai.config  # noqa: F401  (loads Archon/.env, sets sys.path)

EVAL_DIR = Path(__file__).resolve().parent
APP_NAME = "archon_audit"
APP_DIR = EVAL_DIR / APP_NAME
# Two evalsets: the guardrail case short-circuits before any LlmAgent runs, which ADK's LLM-judge metrics
# cannot score ("<root> not found in the agentic system"), so it gets a deterministic config of its own.
SUITES = {
    "audit": (APP_DIR / f"{APP_NAME}.evalset.json", APP_DIR / "test_config.json"),
    "guardrails": (APP_DIR / "archon_guardrails.evalset.json", APP_DIR / "guardrail_config.json"),
}
EVALSET_PATH, CONFIG_PATH = SUITES["audit"]
ADK_DIR = APP_DIR / ".adk"
HISTORY_DIR = ADK_DIR / "eval_history"
BATCH_DIR = ADK_DIR / "batches"  # one manifest per `run.py` invocation (groups per-case result files)
REPORT_PATH = EVAL_DIR.parent / "reports" / "eval_dashboard.html"
BENCH_RESULTS_DIR = EVAL_DIR.parent / "results"  # written by archon_agai.eval.run_eval

EVAL_LLM_KEY = os.getenv("FREELLMAPI_KEY", "").strip()
EVAL_BASE_URL = os.getenv("AGAI_EVAL_LLM_BASE_URL", "http://127.0.0.1:31415/v1").rstrip("/")
EVAL_MODEL = os.getenv("AGAI_EVAL_MODEL", "auto").strip() or "auto"
JUDGE_MODEL = os.getenv("AGAI_EVAL_JUDGE_MODEL", "").strip() or EVAL_MODEL


def litellm_id(model: str) -> str:
    """Router models are reached through LiteLLM's OpenAI-compatible provider."""
    return model if model.startswith("openai/") else f"openai/{model}"


def apply_judge_env() -> None:
    """ADK builds judge models from a bare name (LiteLlm without api_base), so LiteLLM falls back to the
    OPENAI_* variables. Point them at the router for this process only."""
    os.environ["OPENAI_API_BASE"] = EVAL_BASE_URL
    os.environ["OPENAI_BASE_URL"] = EVAL_BASE_URL
    os.environ["OPENAI_API_KEY"] = EVAL_LLM_KEY or "missing"


def require_key() -> None:
    if not EVAL_LLM_KEY:
        raise SystemExit("FREELLMAPI_KEY is not set in Archon/.env; the eval only runs against the local FreeLLMAPI router.")
