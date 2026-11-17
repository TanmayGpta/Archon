#!/usr/bin/env bash
# ==============================================================================
# Archon Azure Quick Update Script
# Easily rebuild and roll out changes to Azure Container Apps from your terminal.
# Usage:
#   ./update_azure.sh frontend       (or ui)
#   ./update_azure.sh arcgen
#   ./update_azure.sh api            (or orchestrator)
#   ./update_azure.sh all
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
    echo -e "${CYAN}======================================================================${NC}"
    echo -e "${CYAN}🚀 Archon Azure Service Updater${NC}"
    echo -e "${CYAN}======================================================================${NC}"
    echo "Usage: $0 <service>"
    echo ""
    echo "Available services:"
    echo "  frontend    - Next.js UI container (archon-ui)"
    echo "  arcgen      - Architecture Generation microservice (archon-arcgen)"
    echo "  api         - Orchestrator / Gateway microservice (archon-api)"
    echo "  all         - Rebuild and update all 3 services"
    echo ""
    exit 1
fi

RG="archon-app-rg"
ENV_NAME="archon-env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo -e "${CYAN}🔍 Detecting Azure environment details...${NC}"
ACR_NAME=$(az acr list --resource-group "$RG" --query "[0].name" -o tsv 2>/dev/null || true)
if [[ -z "$ACR_NAME" ]]; then
    echo -e "${RED}❌ Could not find ACR in resource group $RG. Are you logged in with 'az login'?${NC}"
    exit 1
fi

ACR_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
echo -e "${CYAN}🔑 Authenticating with ACR ($ACR_NAME)...${NC}"
az acr login --name "$ACR_NAME"
DEFAULT_DOMAIN=$(az containerapp env show --name "$ENV_NAME" --resource-group "$RG" --query "properties.defaultDomain" -o tsv)

API_FQDN="archon-api.$DEFAULT_DOMAIN"
ARCGEN_FQDN="archon-arcgen.$DEFAULT_DOMAIN"
UI_FQDN="archon-ui.$DEFAULT_DOMAIN"

TAG="rev-$(date +%Y%m%d-%H%M%S)"

echo -e "${GREEN}• Registry:${NC}  $ACR_SERVER"
echo -e "${GREEN}• Revision:${NC}  $TAG"
echo ""

update_frontend() {
    echo -e "${CYAN}🔨 [1/3] Building Next.js Frontend (archon-ui)...${NC}"
    docker build -t "$ACR_SERVER/archon-ui:$TAG" -t "$ACR_SERVER/archon-ui:latest" \
        --build-arg "NEXT_PUBLIC_API_URL=https://$API_FQDN" \
        --build-arg "NEXT_PUBLIC_ARCGEN_API_URL=https://$ARCGEN_FQDN" \
        -f copilot_ide/frontend/Dockerfile copilot_ide/frontend
    
    echo -e "${CYAN}📤 [2/3] Pushing to ACR...${NC}"
    docker push "$ACR_SERVER/archon-ui:$TAG"
    docker push "$ACR_SERVER/archon-ui:latest"
    
    echo -e "${CYAN}🔄 [3/3] Deploying to Azure Container Apps (archon-ui)...${NC}"
    az containerapp update --name "archon-ui" --resource-group "$RG" --image "$ACR_SERVER/archon-ui:$TAG"
    echo -e "${GREEN}✅ archon-ui updated: https://$UI_FQDN${NC}\n"
}

update_arcgen() {
    echo -e "${CYAN}🔨 [1/3] Building ArcGen Service (archon-arcgen)...${NC}"
    docker build -t "$ACR_SERVER/archon-arcgen:$TAG" -t "$ACR_SERVER/archon-arcgen:latest" \
        -f copilot_ide/services/arcgen_service/Dockerfile copilot_ide/services/arcgen_service
    
    echo -e "${CYAN}📤 [2/3] Pushing to ACR...${NC}"
    docker push "$ACR_SERVER/archon-arcgen:$TAG"
    docker push "$ACR_SERVER/archon-arcgen:latest"
    
    echo -e "${CYAN}🔄 [3/3] Deploying to Azure Container Apps (archon-arcgen)...${NC}"
    az containerapp update --name "archon-arcgen" --resource-group "$RG" --image "$ACR_SERVER/archon-arcgen:$TAG"
    echo -e "${GREEN}✅ archon-arcgen updated: https://$ARCGEN_FQDN${NC}\n"
}

update_api() {
    echo -e "${CYAN}🔨 [1/3] Building Orchestrator API (archon-api)...${NC}"
    docker build -t "$ACR_SERVER/archon-api:$TAG" -t "$ACR_SERVER/archon-api:latest" \
        -f copilot_ide/services/orchestrator_service/Dockerfile.azure .
    
    echo -e "${CYAN}📤 [2/3] Pushing to ACR...${NC}"
    docker push "$ACR_SERVER/archon-api:$TAG"
    docker push "$ACR_SERVER/archon-api:latest"
    
    echo -e "${CYAN}🔄 [3/3] Deploying to Azure Container Apps (archon-api)...${NC}"
    az containerapp update --name "archon-api" --resource-group "$RG" --image "$ACR_SERVER/archon-api:$TAG"
    echo -e "${GREEN}✅ archon-api updated: https://$API_FQDN${NC}\n"
}

case "$TARGET" in
    frontend|ui)
        update_frontend
        ;;
    arcgen)
        update_arcgen
        ;;
    api|orchestrator)
        update_api
        ;;
    all)
        update_frontend
        update_arcgen
        update_api
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${NC}"
        echo "Valid targets: frontend, arcgen, api, all"
        exit 1
        ;;
esac

echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo -e "🌐 UI:      https://$UI_FQDN"
echo -e "🌐 ArcGen:  https://$ARCGEN_FQDN"
echo -e "🌐 API:     https://$API_FQDN"
echo -e "${GREEN}======================================================================${NC}"
