import os
from pathlib import Path

PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://localhost:8001")
INGESTION_SERVICE_URL = os.getenv("INGESTION_SERVICE_URL", "http://localhost:8002")

def get_ollama_url() -> str:
    path = Path("/tmp/ollama_url.txt")
    if path.exists():
        try:
            val = path.read_text(encoding="utf-8").strip()
            if val.startswith("http"):
                return val
        except Exception:
            pass
    return os.getenv("OLLAMA_URL", "http://localhost:11434")

OLLAMA_URL = get_ollama_url()
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gemma3:4b")
