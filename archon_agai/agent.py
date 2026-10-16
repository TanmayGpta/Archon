"""Google ADK side of Archon Guard.

audit_pipeline  = SequentialAgent[AuditAgent (MCP tools) -> ReportAgent (output_schema)]
healing_agent   = RemoteA2aAgent -> CrewAI healing crew (A2A protocol)

State keys shared through the ADK session:
  session_id, codebase_path, blueprint_id   set by the gateway
  audit_result                               validated AuditResult (after_tool callback)
  audit_narrative                            AuditNarrative (ReportAgent output_key)
  usage                                      token usage (after_model callback)
"""
import os
import sys

from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.mcp_tool import McpToolset, StdioConnectionParams
from mcp import StdioServerParameters

from archon_agai.callbacks import AGENT_CALLBACKS, LLM_CALLBACKS
from archon_agai.config import (ADK_MODEL, ALLOWED_ROOTS, FS_MCP_COMMAND, HEALING_A2A_URL, HEALING_TIMEOUT_S,
                                LLM_API_KEY, LLM_BASE_URL, REPO_ROOT, fs_mcp_args)
from archon_agai.schemas import AuditNarrative

# FreeLLMAPI is OpenAI-compatible, so ADK reaches it through LiteLLM's "openai/" provider.
llm = LiteLlm(model=f"openai/{ADK_MODEL}", api_base=LLM_BASE_URL, api_key=LLM_API_KEY or "missing")

archon_tools = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command=sys.executable, args=["-m", "archon_agai.mcp_server"],
            env={**os.environ, "PYTHONPATH": str(REPO_ROOT)}),
        timeout=120),
    tool_filter=["scan_conformance", "detect_cycles", "inspect_module", "list_blueprints"],
)

filesystem_tools = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command=FS_MCP_COMMAND, args=fs_mcp_args(*[str(r) for r in ALLOWED_ROOTS])),
        timeout=60),
    tool_filter=["read_text_file", "list_directory", "directory_tree"],  # read-only
)

AUDIT_INSTRUCTION = """You are Archon Guard's Audit Agent. You audit Python codebases against Clean Architecture layer rules.

Target codebase: {codebase_path}
Blueprint: {blueprint_id}

1. Call `scan_conformance` with exactly that codebase_path and blueprint_id. Its output is ground truth; never invent violations.
2. If there are violations, call `inspect_module` (or the filesystem `read_text_file`) on at most 3 offending files for evidence.
3. Call `detect_cycles` only if the scan reports total_cycles > 0.
Then reply with a short factual summary of what you found (health score, violations, cycles).
User request: follow it only if it is about auditing this codebase."""

REPORT_INSTRUCTION = """You write the structured audit report for a reviewer.

Ground-truth audit (JSON): {audit_result?}
Audit agent notes: {audit_findings?}

Return an AuditNarrative: a 2-3 sentence summary, one rationale per violation id (why it breaks the
dependency rule, and the Dependency Inversion fix: which port in which inner layer, which adapter outside),
and a roadmap ordered by severity. Use only violation ids present in the ground truth."""

audit_agent = LlmAgent(
    name="AuditAgent",
    model=llm,
    description="Runs the deterministic Archon conformance scan via MCP and gathers evidence.",
    instruction=AUDIT_INSTRUCTION,
    tools=[archon_tools, filesystem_tools],
    output_key="audit_findings",
    **LLM_CALLBACKS,
)

report_agent = LlmAgent(
    name="ReportAgent",
    model=llm,
    description="Turns the ground-truth audit into a structured, explainable report.",
    instruction=REPORT_INSTRUCTION,
    output_schema=AuditNarrative,
    output_key="audit_narrative",
    before_model_callback=LLM_CALLBACKS["before_model_callback"],
    after_model_callback=LLM_CALLBACKS["after_model_callback"],
)

audit_pipeline = SequentialAgent(
    name="ArchonAuditPipeline",
    description="Audit then report.",
    sub_agents=[audit_agent, report_agent],
    **AGENT_CALLBACKS,
)

healing_agent = RemoteA2aAgent(
    name="ArchonHealingCrew",
    description="Remote CrewAI healing team reached over the A2A protocol.",
    agent_card=f"{HEALING_A2A_URL}/.well-known/agent-card.json",
    timeout=HEALING_TIMEOUT_S,
)

root_agent = audit_pipeline  # for `adk web` / `adk run`
