import os

PORT = int(os.getenv("PORT", "8003"))
HOST = os.getenv("HOST", "0.0.0.0")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://172.31.112.1:11434")
RAG_SERVICE_URL = os.getenv("RAG_SERVICE_URL", "http://rag-service:8001")
INGESTION_SERVICE_URL = os.getenv("INGESTION_SERVICE_URL", "http://ingestion-service:8002")

EVAL_MODEL_1 = os.getenv("EVAL_MODEL_1", "gemma3:4b")
EVAL_MODEL_2 = os.getenv("EVAL_MODEL_2", "codellama:7b")
EVAL_MODEL_3 = os.getenv("EVAL_MODEL_3", "starcoder2:3b")

# Scoring mode: "keyword" (default) or "llm"
SCORING_MODE = os.getenv("SCORING_MODE", "keyword")
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "gemma3:1b")  # Only used in llm mode

# GPU sampling: "nvidia-smi" or "none"
GPU_SAMPLING = os.getenv("GPU_SAMPLING", "none")
NVIDIA_SMI_PATH = os.getenv("NVIDIA_SMI_PATH", "/usr/bin/nvidia-smi")

# SQLite file path (persisted on a named Docker volume)
DB_PATH = os.getenv("DB_PATH", "/app/data/evaluation.db")

# Resource sampling interval in seconds
RESOURCE_POLL_INTERVAL = float(os.getenv("RESOURCE_POLL_INTERVAL", "0.5"))
