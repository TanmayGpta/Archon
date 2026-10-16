"""ADK callbacks: monitoring (events + token usage), guardrails and tool-output validation."""
import json
from typing import Any, Dict, Optional

from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.adk.tools import BaseTool, ToolContext
from google.genai import types

from archon_agai.events import emit
from archon_agai.guardrails import resolve_allowed_path, screen_user_prompt, validate_tool_output
from archon_agai.schemas import AuditResult

PATH_ARGS = ("codebase_path", "path", "file_path")
FS_TOOLS = ("read_text_file", "list_directory", "search_files", "directory_tree")


def _sid(ctx) -> str:
    return ctx.state.get("session_id", "unknown")


def unwrap_mcp(resp: Any) -> Any:
    """MCP CallToolResult (as dict) -> the tool's actual JSON payload."""
    if not isinstance(resp, dict):
        return resp
    sc = resp.get("structuredContent") or resp.get("structured_content")
    if isinstance(sc, dict):
        return sc.get("result", sc) if len(sc) == 1 and "result" in sc else sc
    content = resp.get("content")
    if isinstance(content, list) and content and isinstance(content[0], dict) and "text" in content[0]:
        text = content[0]["text"]
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return {"text": text}
    return resp


# --------------------------------------------------------------------------- agent level

def before_agent(callback_context: CallbackContext) -> Optional[types.Content]:
    """Input guardrail: block prompt injection / toxic prompts before any model call."""
    uc = callback_context.user_content
    text = " ".join(p.text for p in (uc.parts if uc else []) if getattr(p, "text", None))
    emit(_sid(callback_context), "adk", "agent_start", text[:200], agent=callback_context.agent_name)
    reasons = screen_user_prompt(text)
    if reasons:
        callback_context.state["guardrail_blocked"] = reasons
        emit(_sid(callback_context), "guardrail", "guardrail_block", "user prompt blocked",
             agent=callback_context.agent_name, data={"reasons": reasons})
        return types.Content(role="model", parts=[types.Part(text=(
            "Request blocked by Archon Guard input guardrail: " + "; ".join(reasons)))])
    return None


def after_agent(callback_context: CallbackContext) -> Optional[types.Content]:
    emit(_sid(callback_context), "adk", "agent_end", "", agent=callback_context.agent_name)
    return None


# --------------------------------------------------------------------------- model level

def before_model(callback_context: CallbackContext, llm_request: LlmRequest) -> Optional[LlmResponse]:
    emit(_sid(callback_context), "adk", "model_start", f"{len(llm_request.contents or [])} messages",
         agent=callback_context.agent_name, data={"model": llm_request.model})
    return None


def after_model(callback_context: CallbackContext, llm_response: LlmResponse) -> Optional[LlmResponse]:
    um = llm_response.usage_metadata
    usage: Dict[str, int] = dict(callback_context.state.get("usage", {}) or {})
    if um:
        usage["prompt_tokens"] = usage.get("prompt_tokens", 0) + (um.prompt_token_count or 0)
        usage["output_tokens"] = usage.get("output_tokens", 0) + (um.candidates_token_count or 0)
        usage["llm_calls"] = usage.get("llm_calls", 0) + 1
        callback_context.state["usage"] = usage
    calls = [p.function_call.name for p in (llm_response.content.parts if llm_response.content else [])
             if getattr(p, "function_call", None)]
    emit(_sid(callback_context), "adk", "model_end", f"tool calls: {calls}" if calls else "text response",
         agent=callback_context.agent_name, data={"usage": usage, "error": llm_response.error_message})
    return None


# --------------------------------------------------------------------------- tool level

def before_tool(tool: BaseTool, args: Dict[str, Any], tool_context: ToolContext) -> Optional[Dict]:
    """Argument guardrail: confine every path to the session's codebase / allowed roots."""
    sid = _sid(tool_context)
    emit(sid, "adk", "tool_start", tool.name, agent=tool_context.agent_name, data={"args": args})
    codebase = tool_context.state.get("codebase_path")
    for key in PATH_ARGS:
        if key in args and isinstance(args[key], str):
            try:
                base = resolve_allowed_path(codebase) if codebase else None
                if key == "file_path" and tool.name == "inspect_module":
                    continue  # relative to codebase_path, validated server-side
                resolve_allowed_path(args[key], base)
            except ValueError as e:
                emit(sid, "guardrail", "guardrail_block", f"{tool.name}: {e}", agent=tool_context.agent_name)
                return {"error": f"guardrail: {e}"}
    if tool.name == "scan_conformance" and codebase and "codebase_path" in args:
        args["codebase_path"] = codebase  # the model can't redirect the audit elsewhere
    return None


def after_tool(tool: BaseTool, args: Dict[str, Any], tool_context: ToolContext,
               tool_response: Any) -> Optional[Dict]:
    """Type-check tool outputs and publish validated ground truth into session state."""
    sid = _sid(tool_context)
    payload = unwrap_mcp(tool_response)
    if tool.name == "scan_conformance":
        ok, why = validate_tool_output(payload, AuditResult)
        if not ok:
            emit(sid, "guardrail", "tool_output_invalid", why, agent=tool_context.agent_name)
            return {"error": why}
        tool_context.state["audit_result"] = payload
        emit(sid, "adk", "tool_end", f"health={payload['metrics']['health_score']} "
                                     f"violations={payload['metrics']['total_violations']}",
             agent=tool_context.agent_name, data={"violations": [v["id"] for v in payload["violations"]]})
    else:
        emit(sid, "adk", "tool_end", tool.name, agent=tool_context.agent_name,
             data={"preview": str(payload)[:300]})
    return None


def on_tool_error(tool: BaseTool, args: Dict[str, Any], tool_context: ToolContext, error: Exception) -> Optional[Dict]:
    emit(_sid(tool_context), "adk", "error", f"{tool.name}: {type(error).__name__}: {error}", agent=tool_context.agent_name)
    return {"error": str(error)}


AGENT_CALLBACKS = dict(before_agent_callback=before_agent, after_agent_callback=after_agent)
LLM_CALLBACKS = dict(before_model_callback=before_model, after_model_callback=after_model,
                     before_tool_callback=before_tool, after_tool_callback=after_tool,
                     on_tool_error_callback=on_tool_error)
