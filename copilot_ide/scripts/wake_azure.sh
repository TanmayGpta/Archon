#!/usr/bin/env bash
# ==============================================================================
# Wake Up Archon Azure Container Apps (Eliminate 503 Cold-Start Latency)
# Sets min-replicas to 1 so containers remain warm and instantly responsive.
# ==============================================================================

set -euo pipefail

RG="archon-app-rg"

echo "⚡ Waking up Archon apps (setting min-replicas to 1)..."

for app in "archon-api" "archon-arcgen" "archon-ui"; do
    echo "• Warming up $app..."
    az containerapp update --name "$app" --resource-group "$RG" --min-replicas 1 --output none
done

echo "======================================================================"
echo "✅ All Archon apps are now warm and running (1 replica each)!"
echo "🚀 Responses will be instant with zero cold-start 503 delays."
echo "💡 When done testing, run 'bash copilot_ide/scripts/sleep_azure.sh' to save credits."
echo "======================================================================"
