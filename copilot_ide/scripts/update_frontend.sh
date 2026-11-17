#!/usr/bin/env bash
# ==============================================================================
# Helper Script: Rebuild and Update Frontend on Azure Container Apps
# ==============================================================================

set -euo pipefail

RG="archon-app-rg"
ENV_NAME="archon-env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

ACR_NAME=$(az acr list --resource-group "$RG" --query "[0].name" -o tsv)
ACR_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
DEFAULT_DOMAIN=$(az containerapp env show --name "$ENV_NAME" --resource-group "$RG" --query "properties.defaultDomain" -o tsv)

API_FQDN="archon-api.$DEFAULT_DOMAIN"
ARCGEN_FQDN="archon-arcgen.$DEFAULT_DOMAIN"
UI_FQDN="archon-ui.$DEFAULT_DOMAIN"

echo "======================================================================"
echo "🚀 Updating Archon Frontend Container..."
echo "• API Endpoint:    https://$API_FQDN"
echo "• ArcGen Endpoint: https://$ARCGEN_FQDN"
echo "======================================================================"

TAG="v3"

echo "🔨 Building Next.js frontend with mixed-content fixes..."
docker build -t "$ACR_SERVER/archon-ui:$TAG" -t "$ACR_SERVER/archon-ui:latest" \
    --build-arg "NEXT_PUBLIC_API_URL=https://$API_FQDN" \
    --build-arg "NEXT_PUBLIC_ARCGEN_API_URL=https://$ARCGEN_FQDN" \
    -f copilot_ide/frontend/Dockerfile copilot_ide/frontend

echo "📤 Pushing updated image to ACR..."
docker push "$ACR_SERVER/archon-ui:$TAG"
docker push "$ACR_SERVER/archon-ui:latest"

echo "🔄 Updating Azure Container App (archon-ui)..."
az containerapp update --name "archon-ui" --resource-group "$RG" --image "$ACR_SERVER/archon-ui:$TAG"

echo "======================================================================"
echo "✅ Frontend successfully updated!"
echo "🌐 URL: https://$UI_FQDN"
echo "======================================================================"
