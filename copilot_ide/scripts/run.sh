#!/bin/bash
# Enterprise API Copilot Microservices Local Startup Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_PYTHON="$ROOT_DIR/backend/venv/bin/python3"

echo "=== Starting Enterprise API Copilot Microservices Mesh ==="

# Trap cleanup on exit
cleanup() {
    echo "Stopping all microservices..."
    kill $INGESTION_PID $RAG_PID $ORCHESTRATOR_PID $FRONTEND_PID 2>/dev/null
    exit
}
trap cleanup SIGINT SIGTERM

# 1. Start Ingestion Service (Port 8002)
echo "Starting [1/4] Ingestion Service (http://localhost:8002)..."
cd "$ROOT_DIR/services/ingestion_service"
PYTHONPATH="$ROOT_DIR/services/ingestion_service" $VENV_PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port 8002 &
INGESTION_PID=$!

# 2. Start RAG & Search Service (Port 8001)
echo "Starting [2/4] RAG & Hybrid Search Service (http://localhost:8001)..."
cd "$ROOT_DIR/services/rag_service"
PYTHONPATH="$ROOT_DIR/services/rag_service" $VENV_PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port 8001 &
RAG_PID=$!

# 3. Start Orchestrator Gateway Service (Port 8000)
echo "Starting [3/4] Orchestrator Gateway (http://localhost:8000)..."
cd "$ROOT_DIR/services/orchestrator_service"
PYTHONPATH="$ROOT_DIR/services/orchestrator_service" $VENV_PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
ORCHESTRATOR_PID=$!

# 4. Start Next.js Frontend (Port 3000)
echo "Starting [4/4] Next.js Frontend (http://localhost:3000)..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo "=== Microservices Mesh Running ==="
echo "Frontend:     http://localhost:3000"
echo "Orchestrator: http://localhost:8000 (API Docs: http://localhost:8000/docs)"
echo "RAG Engine:   http://localhost:8001 (API Docs: http://localhost:8001/docs)"
echo "Ingestion:    http://localhost:8002 (API Docs: http://localhost:8002/docs)"

wait $INGESTION_PID $RAG_PID $ORCHESTRATOR_PID $FRONTEND_PID
