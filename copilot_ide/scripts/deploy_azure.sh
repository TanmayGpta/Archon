#!/usr/bin/env bash
# ==============================================================================
# Archon Ultra-Robust Azure Container Apps Deployment
# Optimized for Azure for Students ($100 credit, scale-to-zero)
# Uses local Docker engine for guaranteed, instant builds without cloud SAS limits.
# ==============================================================================

set -euo pipefail

# ANSI Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN}🚀 ARCHON ROBUST AZURE DEPLOYMENT (Azure for Students)${NC}"
echo -e "${CYAN}======================================================================${NC}"

# 1. Verify Prerequisites
if ! command -v az &>/dev/null; then
    echo -e "${RED}❌ Azure CLI ('az') is not installed.${NC}"
    echo "👉 Run: sudo bash copilot_ide/scripts/install_azure_cli.sh"
    exit 1
fi

if ! command -v docker &>/dev/null; then
    echo -e "${RED}❌ Docker is not installed or not in PATH.${NC}"
    exit 1
fi

if ! docker info &>/dev/null; then
    echo -e "${RED}❌ Docker daemon is not running. Please start Docker (e.g. 'sudo systemctl start docker')${NC}"
    exit 1
fi

ACCOUNT_CHECK=$(az account show --output json 2>/dev/null || true)
if [[ -z "$ACCOUNT_CHECK" ]]; then
    echo -e "${YELLOW}🔑 You are not logged into Azure CLI. Launching login...${NC}"
    az login --output table
fi

# 2. Select Verified Region & Unconflicted Resource Names
# uaenorth is verified on your student subscription policy and has zero AI API blocks
REGION="${1:-uaenorth}"
RG="archon-app-rg"
ENV_NAME="archon-env"

# Unique ACR name (lowercase alphanumeric, 5-50 chars)
RAND_ID=$(( (RANDOM % 90000) + 10000 ))
ACR_NAME="archonreg${RAND_ID}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo -e "${GREEN}Active Subscription:${NC}"
az account show --query "{Subscription:name, ID:id}" -o table

echo ""
echo -e "${YELLOW}Deployment Plan:${NC}"
echo "• Target Region:       $REGION (UAE North - unblocked AI APIs & confirmed student policy)"
echo "• Resource Group:      $RG"
echo "• Container Registry:  $ACR_NAME (Basic SKU - \$5/mo max, no idle cost)"
echo "• ACA Environment:     $ENV_NAME"
echo "• Build Strategy:      Local Docker Engine (100% reliable, zero SAS upload limits)"
echo ""

# 3. Register Essential Azure Resource Providers (idempotent, skips if registered)
echo -e "${CYAN}📦 Step 1/6: Ensuring Azure resource providers are active...${NC}"
for ns in "Microsoft.ContainerRegistry" "Microsoft.App" "Microsoft.OperationalInsights"; do
    state=$(az provider show --namespace "$ns" --query "registrationState" -o tsv 2>/dev/null || echo "NotRegistered")
    if [[ "$state" != "Registered" ]]; then
        echo -e "  • Registering $ns..."
        az provider register --namespace "$ns" --output none
    else
        echo -e "  • $ns is ${GREEN}Registered${NC}"
    fi
done

# 4. Create Fresh Resource Group
echo -e "${CYAN}📦 Step 2/6: Creating Resource Group in $REGION...${NC}"
az group create --name "$RG" --location "$REGION" --output table

# 5. Create Azure Container Registry (Basic SKU) & Authenticate Docker
echo -e "${CYAN}🐳 Step 3/6: Creating Azure Container Registry ($ACR_NAME)...${NC}"
az acr create \
    --resource-group "$RG" \
    --name "$ACR_NAME" \
    --sku Basic \
    --admin-enabled true \
    --location "$REGION" \
    --output table

ACR_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
ACR_USER=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

echo -e "🔑 Authenticating local Docker daemon with $ACR_SERVER..."
az acr login --name "$ACR_NAME"

# 6. Create Azure Container Apps Managed Environment
echo -e "${CYAN}🌐 Step 4/6: Creating Serverless Container Apps Environment...${NC}"
az containerapp env create \
    --name "$ENV_NAME" \
    --resource-group "$RG" \
    --location "$REGION" \
    --output table

DEFAULT_DOMAIN=$(az containerapp env show --name "$ENV_NAME" --resource-group "$RG" --query "properties.defaultDomain" -o tsv)
API_FQDN="archon-api.$DEFAULT_DOMAIN"
ARCGEN_FQDN="archon-arcgen.$DEFAULT_DOMAIN"
UI_FQDN="archon-ui.$DEFAULT_DOMAIN"

echo -e "Registered Environment Domain: ${GREEN}$DEFAULT_DOMAIN${NC}"

# Read optional API keys from local .env if present
GROQ_API_KEY="${GROQ_API_KEY:-}"
if [[ -z "$GROQ_API_KEY" ]] && [[ -f "$REPO_ROOT/copilot_ide/.env" ]]; then
    GROQ_API_KEY=$(grep -E '^GROQ_API_KEY=' "$REPO_ROOT/copilot_ide/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)
fi

# 7. Build and Push Images using Local Docker
echo -e "${CYAN}🔨 Step 5/6: Building and pushing Docker images to ACR...${NC}"

echo -e "  ${YELLOW}[1/3] Building Orchestrator Service (archon-api)...${NC}"
docker build -t "$ACR_SERVER/archon-api:latest" \
    -f copilot_ide/services/orchestrator_service/Dockerfile.azure .
docker push "$ACR_SERVER/archon-api:latest"

echo -e "  ${YELLOW}[2/3] Building ArcGen Microservice (archon-arcgen)...${NC}"
docker build -t "$ACR_SERVER/archon-arcgen:latest" \
    -f copilot_ide/services/arcgen_service/Dockerfile copilot_ide/services/arcgen_service
docker push "$ACR_SERVER/archon-arcgen:latest"

echo -e "  ${YELLOW}[3/3] Building Next.js Frontend with inlined backend endpoints...${NC}"
docker build -t "$ACR_SERVER/archon-ui:latest" \
    --build-arg "NEXT_PUBLIC_API_URL=https://$API_FQDN" \
    --build-arg "NEXT_PUBLIC_ARCGEN_API_URL=https://$ARCGEN_FQDN" \
    -f copilot_ide/frontend/Dockerfile copilot_ide/frontend
docker push "$ACR_SERVER/archon-ui:latest"

# 8. Deploy Container Apps
echo -e "${CYAN}🚀 Step 6/6: Deploying Serverless Container Apps (Scale-to-Zero)...${NC}"

echo -e "  • Launching Orchestrator Gateway (port 8000)..."
az containerapp create \
    --name "archon-api" \
    --resource-group "$RG" \
    --environment "$ENV_NAME" \
    --image "$ACR_SERVER/archon-api:latest" \
    --registry-server "$ACR_SERVER" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --target-port 8000 \
    --ingress external \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 0 \
    --max-replicas 1 \
    --env-vars "GROQ_API_KEY=$GROQ_API_KEY" \
    --output none

echo -e "  • Launching ArcGen Service (port 8004)..."
az containerapp create \
    --name "archon-arcgen" \
    --resource-group "$RG" \
    --environment "$ENV_NAME" \
    --image "$ACR_SERVER/archon-arcgen:latest" \
    --registry-server "$ACR_SERVER" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --target-port 8004 \
    --ingress external \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 0 \
    --max-replicas 1 \
    --env-vars "GROQ_API_KEY=$GROQ_API_KEY" \
    --output none

echo -e "  • Launching Next.js Frontend (port 3000)..."
az containerapp create \
    --name "archon-ui" \
    --resource-group "$RG" \
    --environment "$ENV_NAME" \
    --image "$ACR_SERVER/archon-ui:latest" \
    --registry-server "$ACR_SERVER" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --target-port 3000 \
    --ingress external \
    --cpu 0.25 \
    --memory 0.5Gi \
    --min-replicas 0 \
    --max-replicas 1 \
    --output none

echo ""
echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}🎉 ARCHON COPILOT IDE IS LIVE ON AZURE!${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "🌐 ${CYAN}Archon Web IDE (UI):${NC}    https://$UI_FQDN"
echo -e "⚡ ${CYAN}Orchestrator Gateway:${NC}    https://$API_FQDN"
echo -e "🏗️ ${CYAN}ArcGen Service:${NC}         https://$ARCGEN_FQDN"
echo ""
echo -e "${YELLOW}💰 Credit Protection Status:${NC}"
echo "• min-replicas set to 0: Containers scale down to 0 when idle ($0.00 consumed)"
echo "• Free allowance: Fits within Azure's 180,000 vCPU-seconds monthly grant"
echo "• Free automatic HTTPS & SSL managed by Azure"
echo -e "${GREEN}======================================================================${NC}"
