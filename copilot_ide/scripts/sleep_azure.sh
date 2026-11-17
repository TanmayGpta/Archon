#!/usr/bin/env bash
# ==============================================================================
# Put Archon Azure Container Apps to Sleep ($0.00 Idle Cost)
# Sets min-replicas to 0 for all apps
# ==============================================================================

set -euo pipefail

RG="archon-app-rg"

echo "💤 Putting Archon apps to sleep (scale-to-zero)..."

for app in "archon-api" "archon-arcgen" "archon-ui"; do
    echo "• Sleeping $app..."
    az containerapp update --name "$app" --resource-group "$RG" --min-replicas 0 --output none
done

echo "✅ All Archon apps are now configured to scale down to 0 replicas when idle."
echo "💰 Idle consumption is $0.00."
