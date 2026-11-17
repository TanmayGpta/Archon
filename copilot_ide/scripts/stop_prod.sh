#!/usr/bin/env bash
# ==============================================================================
# Stop Archon Copilot IDE in Production Mode
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IDE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$IDE_DIR"

echo "🛑 Stopping Archon Copilot IDE containers..."
docker compose -f docker-compose.prod.yml --profile proxy down

echo "✅ All containers stopped."
