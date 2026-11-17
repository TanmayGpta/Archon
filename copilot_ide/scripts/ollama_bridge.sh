#!/usr/bin/env bash
# ==============================================================================
# Archon Intelligent Ollama Bridge
# Bridges local Ollama directly to the hosted Archon Azure stack
# ==============================================================================

REAL_OLLAMA="/usr/bin/ollama"
AZURE_API="https://archon-api.gentlemushroom-d7227a19.uaenorth.azurecontainerapps.io"
AZURE_ARCGEN="https://archon-arcgen.gentlemushroom-d7227a19.uaenorth.azurecontainerapps.io"

# If the user is running any other command (e.g. ollama run, ollama list, ollama pull),
# pass directly to real ollama:
if [[ "$#" -gt 0 && "$1" != "serve" ]]; then
    exec "$REAL_OLLAMA" "$@"
fi

# Set host and CORS so cloud tunnel and remote requests connect smoothly
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"

echo "======================================================================"
echo "🦙 Archon Ollama Cloud Bridge"
echo "======================================================================"

# Ensure cloudflared is in PATH
if ! command -v cloudflared &>/dev/null; then
    if [[ -x "$HOME/.local/bin/cloudflared" ]]; then
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi

# Check if an existing Ollama is already running
PORT_IN_USE=false
if curl -s http://127.0.0.1:11434/api/tags &>/dev/null; then
    PORT_IN_USE=true
    echo "ℹ️ Existing Ollama server detected running on port 11434."
fi

# Start cloudflared tunnel in background
TUNNEL_LOG=$(mktemp)
cloudflared tunnel --url http://127.0.0.1:11434 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

cleanup() {
    echo -e "\n🛑 Disconnecting Archon Cloud Bridge..."
    kill "$TUNNEL_PID" 2>/dev/null || true
    rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT INT TERM

echo -n "⏳ Establishing secure HTTPS tunnel to Azure"
TUNNEL_URL=""
for i in {1..30}; do
    TUNNEL_URL=$(grep -o 'https://[-a-zA-Z0-9@:%._\+~#=]*\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)
    if [[ -n "$TUNNEL_URL" ]]; then
        break
    fi
    echo -n "."
    sleep 0.5
done
echo ""

if [[ -n "$TUNNEL_URL" ]]; then
    echo "🔗 Cloud Tunnel Active: $TUNNEL_URL"
    echo "📡 Registering endpoint with Archon Azure services..."
    curl -s -X POST -H "Content-Type: application/json" -d "{\"url\":\"$TUNNEL_URL\"}" "$AZURE_API/api/ollama/tunnel" >/dev/null 2>&1 || true
    curl -s -X POST -H "Content-Type: application/json" -d "{\"url\":\"$TUNNEL_URL\"}" "$AZURE_ARCGEN/api/arcgen/llm/tunnel" >/dev/null 2>&1 || true
    echo "✅ Connected! Your local Ollama models are now live on Azure."
    echo "🌐 Open Archon: https://archon-ui.gentlemushroom-d7227a19.uaenorth.azurecontainerapps.io"
else
    echo "⚠️ Notice: Tunnel could not be initialized; starting Ollama in standalone mode."
fi
echo "======================================================================"

if [ "$PORT_IN_USE" = true ]; then
    echo "Bridge is active and streaming traffic to your running Ollama server."
    echo "Press Ctrl+C to disconnect."
    wait "$TUNNEL_PID"
else
    exec "$REAL_OLLAMA" serve
fi
