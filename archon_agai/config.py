"""Central configuration. Reads only the repo's own .env (Archon/.env)."""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
AGAI_ROOT = Path(__file__).resolve().parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

load_dotenv(REPO_ROOT / ".env")

# Configure LiteLLM globally to strip reasoning_content for Groq / OpenAI compatibility
try:
    import litellm
    from litellm.integrations.custom_logger import CustomLogger

    class CleanReasoningCallback(CustomLogger):
        async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
            for msg in data.get("messages", []):
                if isinstance(msg, dict):
                    msg.pop("reasoning_content", None)
                    msg.pop("thinking", None)
            return data

        def log_pre_api_call(self, model, messages, kwargs):
            for msg in messages:
                if isinstance(msg, dict):
                    msg.pop("reasoning_content", None)
                    msg.pop("thinking", None)

    litellm.callbacks = [CleanReasoningCallback()]
    litellm.drop_params = True
except Exception:
    pass

# LLMs go through FreeLLMAPI, a local OpenAI-compatible router (override in .env).
# "auto" lets the router pick a provider; pin a model id (see GET /v1/models) for reproducible evals.
LLM_API_KEY = os.getenv("FREELLMAPI_KEY") or os.getenv("OPENROUTER_KEY") or os.getenv("OPENROUTER_API_KEY") or ""

def _resolve_llm_base_url() -> str:
    custom_url = os.getenv("AGAI_LLM_BASE_URL", "")
    if custom_url:
        # If custom URL points to Groq but the user's key is a local FreeLLMAPI key (not gsk_),
        # do not send FreeLLMAPI key to Groq — route to local FreeLLMAPI router instead!
        if "groq.com" in custom_url and not LLM_API_KEY.startswith("gsk_"):
            return "http://127.0.0.1:31415/v1"
        return custom_url
    if LLM_API_KEY.startswith("gsk_"):
        return "https://api.groq.com/openai/v1"
    return "http://127.0.0.1:31415/v1"

LLM_BASE_URL = _resolve_llm_base_url()
ADK_MODEL = os.getenv("AGAI_ADK_MODEL", "openai/gpt-oss-120b" if LLM_API_KEY.startswith("gsk_") else "auto")
CREW_MODEL = os.getenv("AGAI_CREW_MODEL", "openai/gpt-oss-120b" if LLM_API_KEY.startswith("gsk_") else "auto")

# Local offline Ollama fallback (e.g. Qwen 2.5 Coder 3B on localhost:11434)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "ollama/qwen2.5-coder:3b")

# Codebases the agents may heal / write. Anything outside these roots is rejected by guardrails.
ALLOWED_ROOTS = [
    Path(p).resolve()
    for p in os.getenv("AGAI_ALLOWED_ROOTS", str(REPO_ROOT / "test_codebases")).split(os.pathsep)
    if p
]
# Codebases that may be audited and viewed but never healed or edited (Archon itself).
READONLY_ROOTS = [
    Path(p).resolve()
    for p in os.getenv("AGAI_READONLY_ROOTS", str(REPO_ROOT)).split(os.pathsep)
    if p
]
# The IDE's orchestrator may run in Docker and report container paths; map them to host paths
# (longest prefix first). Format: "container=host,container=host". Defaults mirror copilot_ide/docker-compose.yml.
PATH_MAP = sorted(
    ((c.rstrip("/"), h) for c, h in (pair.split("=", 1) for pair in os.getenv("AGAI_PATH_MAP", ",".join([
        f"/workspace/test_codebases={REPO_ROOT / 'test_codebases'}",
        f"/workspace/conformance={REPO_ROOT / 'conformance'}",
        f"/workspace/shared={REPO_ROOT / 'shared'}",
        f"/workspace={REPO_ROOT / 'copilot_ide'}",
        f"/archon={REPO_ROOT}",
    ])).split(",") if "=" in pair)),
    key=lambda m: -len(m[0]),
)


def to_host(p: str) -> str:
    """Container path (/workspace/..., /mnt/c/...) -> host path; anything else is returned unchanged."""
    s = p.replace("\\", "/")
    for c, h in PATH_MAP:
        if s == c or s.startswith(c + "/"):
            return str(Path(h) / s[len(c):].lstrip("/"))
    if os.name == "nt" and len(s) > 6 and s.startswith("/mnt/") and s[6] == "/":  # /mnt/c/Users -> C:/Users
        return f"{s[5].upper()}:/{s[7:]}"
    return p


def to_container(p: str) -> str:
    """Host path -> the path the Dockerised IDE sees (writable mounts only); unchanged if unmapped."""
    hp = Path(p).resolve()
    for c, h in PATH_MAP:
        try:
            return (c + "/" + hp.relative_to(Path(h).resolve()).as_posix()).rstrip("/.")
        except ValueError:
            continue
    return p


# Never readable through the agents or the editor, even inside an allowed root.
SECRET_PARTS = {".env", ".git", ".venv", "node_modules"}
# The UI opens on the Archon repo itself, checked against the Archon Core blueprint.
DEFAULT_CODEBASE = os.getenv("AGAI_DEFAULT_CODEBASE", str(REPO_ROOT))
DEFAULT_BLUEPRINT = os.getenv("AGAI_DEFAULT_BLUEPRINT", "archon_architecture")
# Seeded-violation demo target (used by the offline tests).
DEMO_CODEBASE = str(REPO_ROOT / "test_codebases" / "ecommerce_platform")
# One-click projects in the IDE / conformance pickers: (label, host path, blueprint).
BUILTIN_PROJECTS = [
    ("Archon (this repo)", DEFAULT_CODEBASE, DEFAULT_BLUEPRINT),
    ("E-commerce demo (seeded violations)", DEMO_CODEBASE, "clean_architecture"),
]

# Sandboxes where healing patches are tried before a human applies them.
RUNS_DIR = Path(os.getenv("AGAI_RUNS_DIR", str(AGAI_ROOT / ".runs"))).resolve()

HEALING_A2A_URL = os.getenv("AGAI_HEALING_A2A_URL", "http://127.0.0.1:8101")
HEALING_TIMEOUT_S = float(os.getenv("AGAI_HEALING_TIMEOUT_S", "1800"))  # free providers can be slow
LLM_MAX_TOKENS = int(os.getenv("AGAI_LLM_MAX_TOKENS", "8192"))  # patches need room; some routes cap at 2048
# Per-request cap: a stalled free provider otherwise hangs a heal step indefinitely.
LLM_TIMEOUT_S = float(os.getenv("AGAI_LLM_TIMEOUT_S", "180"))
# CrewAI phones home to its telemetry collector on every kickoff; off unless explicitly enabled.
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
    os.environ.setdefault("OTEL_SDK_DISABLED", "true")
else:
    os.environ["OTEL_SDK_DISABLED"] = "false"
GATEWAY_PORT = int(os.getenv("AGAI_GATEWAY_PORT", "8100"))
HEALING_PORT = int(os.getenv("AGAI_HEALING_PORT", "8101"))

# Filesystem MCP server (external tool #2). Needs Node.js/npx.
FS_MCP_COMMAND = os.getenv("AGAI_FS_MCP_COMMAND", "npx.cmd" if os.name == "nt" else "npx")
FS_MCP_PACKAGE = os.getenv("AGAI_FS_MCP_PACKAGE", "@modelcontextprotocol/server-filesystem@2025.8.21")


def fs_mcp_args(*roots: str) -> list:
    """npx needs '-y <package>'; a globally installed binary (Docker) takes only the roots."""
    return (["-y", FS_MCP_PACKAGE] if FS_MCP_PACKAGE else []) + list(roots)


def require_llm_key() -> None:
    if not LLM_API_KEY:
        raise RuntimeError("FREELLMAPI_KEY is missing. Add it to Archon/.env")
