#!/bin/bash
# ==============================================================================
# Archon Copilot & AI Agent IDE - Universal Launch Script
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================================"
echo "🚀 Starting Archon Copilot & AI Agent IDE Stack..."
echo "📁 Root: $PROJECT_ROOT"
echo "========================================================"

# Kill any existing instances on standard ports
echo "🧹 Cleaning up previous instances on ports 8000, 8001, 8002, 3000..."
lsof -ti :8000,:8001,:8002,:3000 | xargs -r kill -9 2>/dev/null || true
sleep 1

# 1. Start Ingestion Service (Port 8002)
echo "📦 Starting Ingestion Service on http://0.0.0.0:8002..."
PYTHONPATH="$PROJECT_ROOT/services/ingestion_service" \
  "$PROJECT_ROOT/backend/venv/bin/python3" -m uvicorn services.ingestion_service.app.main:app --host 0.0.0.0 --port 8002 > /tmp/archon_ingestion.log 2>&1 &

# 2. Start RAG Service (Port 8001)
echo "🧠 Starting RAG Service (BM25 + ChromaDB + Cross-Encoder) on http://0.0.0.0:8001..."
PYTHONPATH="$PROJECT_ROOT/services/rag_service" \
  "$PROJECT_ROOT/backend/venv/bin/python3" -m uvicorn services.rag_service.app.main:app --host 0.0.0.0 --port 8001 > /tmp/archon_rag.log 2>&1 &

# 3. Start Orchestrator Service (Port 8000)
echo "⚡ Starting Orchestrator Gateway on http://0.0.0.0:8000..."
PYTHONPATH="$PROJECT_ROOT/services/orchestrator_service" \
  "$PROJECT_ROOT/backend/venv/bin/python3" -m uvicorn services.orchestrator_service.app.main:app --host 0.0.0.0 --port 8000 > /tmp/archon_orchestrator.log 2>&1 &

# 4. Start Next.js Frontend (Port 3000)
echo "💻 Starting Next.js Frontend on http://localhost:3000..."
cd "$PROJECT_ROOT/frontend"
npm run dev > /tmp/archon_frontend.log 2>&1 &

sleep 3
echo "========================================================"
echo "✅ All Archon microservices & frontend are online!"
echo "🌐 Open Web App: http://localhost:3000"
echo "📜 Logs: /tmp/archon_*.log"
echo "========================================================"
