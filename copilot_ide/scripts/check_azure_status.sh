#!/usr/bin/env bash
# ==============================================================================
# Helper Script: Diagnose Status & Logs of Azure Container Apps
# ==============================================================================

set -euo pipefail

RG="archon-app-rg"

echo "======================================================================"
echo "🔍 Checking Azure Container Apps Status in $RG..."
echo "======================================================================"

echo "1. App Provisioning & Ingress Status:"
az containerapp list --resource-group "$RG" \
  --query "[].{Name:name, Provisioning:properties.provisioningState, Running:properties.runningStatus, URL:properties.configuration.ingress.fqdn}" \
  -o table

echo ""
echo "2. Replicas & Health Status:"
for app in "archon-api" "archon-arcgen" "archon-ui"; do
    echo "• Replicas for $app:"
    az containerapp replica list --name "$app" --resource-group "$RG" \
      --query "[].{Name:name, Created:properties.createdTime, Containers:properties.containers[0].ready}" \
      -o table 2>/dev/null || echo "  No active replicas (scaled to 0 or starting up)"
done

echo ""
echo "3. Recent Logs for archon-arcgen (Last 30 lines):"
az containerapp logs show --name "archon-arcgen" --resource-group "$RG" --tail 30 2>/dev/null || echo "No logs available yet."

echo ""
echo "4. Testing Direct Health Endpoints:"
for app in "archon-api" "archon-arcgen"; do
    url=$(az containerapp show --name "$app" --resource-group "$RG" --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || true)
    if [[ -n "$url" ]]; then
        echo -n "• Testing https://$url/health ... "
        curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 "https://$url/health" || echo "Timed out"
    fi
done
