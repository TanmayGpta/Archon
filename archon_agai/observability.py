"""Tracing: Langfuse (OpenTelemetry) + OpenInference instrumentation for ADK and CrewAI.

Enabled when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (and optionally LANGFUSE_HOST) are set.
Without them the system still runs; the JSONL event log in .runs/ is the fallback audit trail.
"""
import os

from archon_agai.events import log

_done = False


def setup(service_name: str) -> bool:
    global _done
    if _done:
        return True
    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        log.info("Langfuse keys not set; tracing disabled (JSONL event log still active)")
        return False
    os.environ.setdefault("OTEL_SERVICE_NAME", service_name)
    try:
        from langfuse import get_client
        client = get_client()
        if not client.auth_check():
            log.warning("Langfuse auth failed; tracing disabled")
            return False
        from openinference.instrumentation.crewai import CrewAIInstrumentor
        from openinference.instrumentation.google_adk import GoogleADKInstrumentor
        GoogleADKInstrumentor().instrument()
        CrewAIInstrumentor().instrument()
        _done = True
        log.info("Langfuse tracing enabled for %s", service_name)
        return True
    except Exception as e:  # tracing must never break the agents
        log.warning("Langfuse setup failed: %s", e)
        return False


def flush() -> None:
    if _done:
        from langfuse import get_client
        get_client().flush()
