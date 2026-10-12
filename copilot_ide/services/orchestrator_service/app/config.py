import os

PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")

RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://localhost:8001")
INGESTION_SERVICE_URL = os.getenv("INGESTION_SERVICE_URL", "http://localhost:8002")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gemma3:4b")
