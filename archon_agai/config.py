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

# LLMs go through FreeLLMAPI, a local OpenAI-compatible router (override in .env).
# "auto" lets the router pick a provider; pin a model id (see GET /v1/models) for reproducible evals.
LLM_BASE_URL = os.getenv("AGAI_LLM_BASE_URL", "http://127.0.0.1:31415/v1")
LLM_API_KEY = os.getenv("FREELLMAPI_KEY", "")
ADK_MODEL = os.getenv("AGAI_ADK_MODEL", "auto")
CREW_MODEL = os.getenv("AGAI_CREW_MODEL", "auto")

# Codebases the agents may touch. Anything outside these roots is rejected by guardrails.
ALLOWED_ROOTS = [
    Path(p).resolve()
    for p in os.getenv("AGAI_ALLOWED_ROOTS", str(REPO_ROOT / "test_codebases")).split(os.pathsep)
    if p
]
DEFAULT_CODEBASE = os.getenv("AGAI_DEFAULT_CODEBASE", str(REPO_ROOT / "test_codebases" / "ecommerce_platform"))
DEFAULT_BLUEPRINT = os.getenv("AGAI_DEFAULT_BLUEPRINT", "clean_architecture")

# Sandboxes where healing patches are tried before a human applies them.
RUNS_DIR = Path(os.getenv("AGAI_RUNS_DIR", str(AGAI_ROOT / ".runs"))).resolve()

HEALING_A2A_URL = os.getenv("AGAI_HEALING_A2A_URL", "http://127.0.0.1:8101")
HEALING_TIMEOUT_S = float(os.getenv("AGAI_HEALING_TIMEOUT_S", "1800"))  # free providers can be slow
LLM_MAX_TOKENS = int(os.getenv("AGAI_LLM_MAX_TOKENS", "8192"))  # patches need room; some routes cap at 2048
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
