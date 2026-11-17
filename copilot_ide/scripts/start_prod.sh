#!/usr/bin/env bash
# ==============================================================================
# Start Archon Copilot IDE in Production Mode
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IDE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$IDE_DIR"

if [[ ! -f .env ]]; then
    if [[ -f .env.production.example ]]; then
        echo "⚠️ .env file not found. Creating from .env.production.example..."
        cp .env.production.example .env
        echo "📝 Please review or edit copilot_ide/.env with your API keys if needed."
    fi
fi

# Detect if --proxy flag was passed to enable Caddy SSL reverse proxy
PROFILE_ARGS=()
if [[ "${1:-}" == "--proxy" ]]; then
    PROFILE_ARGS=(--profile proxy)
    echo "🔒 Starting with Caddy Reverse Proxy & SSL profile..."
fi

echo "🚀 Building and starting Archon Copilot IDE containers..."
docker compose -f docker-compose.prod.yml "${PROFILE_ARGS[@]}" up -d --build

echo ""
echo "✅ Archon Copilot IDE stack is running!"
echo "--------------------------------------------------------"
echo "🌐 UI Service:          http://$(curl -s ifconfig.me 2>/dev/null || echo '<YOUR_VM_IP>'):3000"
echo "⚡ Orchestrator Gateway: http://$(curl -s ifconfig.me 2>/dev/null || echo '<YOUR_VM_IP>'):8000"
echo "🏗️ ArcGen Service:       http://$(curl -s ifconfig.me 2>/dev/null || echo '<YOUR_VM_IP>'):8004"
if [[ "${1:-}" == "--proxy" ]]; then
    echo "🔒 Caddy Reverse Proxy: http://$(curl -s ifconfig.me 2>/dev/null || echo '<YOUR_VM_IP>')"
fi
echo "--------------------------------------------------------"
echo "📜 View logs:   docker compose -f docker-compose.prod.yml logs -f"
echo "🛑 Stop stack:  docker compose -f docker-compose.prod.yml down"
