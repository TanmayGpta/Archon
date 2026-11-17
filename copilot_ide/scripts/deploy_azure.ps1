# ==============================================================================
# Archon Ultra-Robust Azure Container Apps Deployment (PowerShell)
# Optimized for Azure for Students ($100 credit, scale-to-zero)
# Uses local Docker engine for guaranteed, instant builds without cloud SAS limits.
# ==============================================================================

param(
    [string]$TargetRegion = "uaenorth"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "🚀 ARCHON ROBUST AZURE DEPLOYMENT (Azure for Students)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Check prerequisites
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI ('az') is not installed."
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not in PATH."
    exit 1
}

$Account = az account show 2>$null
if (-not $Account) {
    Write-Host "🔑 You are not logged into Azure CLI. Launching login..." -ForegroundColor Yellow
    az login --output table
}

# 2. Select Verified Region & Fresh Resource Names
$REGION = $TargetRegion
$RG = "archon-app-rg"
$ENV_NAME = "archon-env"

$RAND_ID = Get-Random -Minimum 10000 -Maximum 99999
$ACR_NAME = "archonreg$RAND_ID"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$REPO_ROOT = Split-Path -Parent (Split-Path -Parent $SCRIPT_DIR)
Set-Location $REPO_ROOT

Write-Host "`nDeployment Plan:" -ForegroundColor Yellow
Write-Host "• Target Region:       $REGION (UAE North - confirmed student policy & zero AI blocks)"
Write-Host "• Resource Group:      $RG"
Write-Host "• Container Registry:  $ACR_NAME (Basic SKU)"
Write-Host "• ACA Environment:     $ENV_NAME"
Write-Host "• Build Strategy:      Local Docker Engine (100% reliable, zero SAS upload limits)`n"

# 3. Register Essential Azure Providers
Write-Host "📦 Step 1/6: Ensuring Azure resource providers are active..." -ForegroundColor Cyan
foreach ($ns in @("Microsoft.ContainerRegistry", "Microsoft.App", "Microsoft.OperationalInsights")) {
    $state = az provider show --namespace $ns --query "registrationState" -o tsv 2>$null
    if ($state -ne "Registered") {
        Write-Host "  • Registering $ns..." -ForegroundColor Yellow
        az provider register --namespace $ns --output none
    } else {
        Write-Host "  • $ns is Registered" -ForegroundColor Green
    }
}

# 4. Create Fresh Resource Group
Write-Host "📦 Step 2/6: Creating Resource Group in $REGION..." -ForegroundColor Cyan
az group create --name $RG --location $REGION --output table

# 5. Create Azure Container Registry (Basic SKU) & Authenticate Docker
Write-Host "🐳 Step 3/6: Creating Azure Container Registry ($ACR_NAME)..." -ForegroundColor Cyan
az acr create --resource-group $RG --name $ACR_NAME --sku Basic --admin-enabled true --location $REGION --output table

$ACR_SERVER = az acr show --name $ACR_NAME --query loginServer -o tsv
$ACR_USER   = az acr credential show --name $ACR_NAME --query username -o tsv
$ACR_PASS   = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv

Write-Host "🔑 Authenticating local Docker daemon with $ACR_SERVER..." -ForegroundColor Yellow
az acr login --name $ACR_NAME

# 6. Create Azure Container Apps Managed Environment
Write-Host "🌐 Step 4/6: Creating Serverless Container Apps Environment..." -ForegroundColor Cyan
az containerapp env create --name $ENV_NAME --resource-group $RG --location $REGION --output table

$DEFAULT_DOMAIN = az containerapp env show --name $ENV_NAME --resource-group $RG --query "properties.defaultDomain" -o tsv
$API_FQDN = "archon-api.$DEFAULT_DOMAIN"
$ARCGEN_FQDN = "archon-arcgen.$DEFAULT_DOMAIN"
$UI_FQDN = "archon-ui.$DEFAULT_DOMAIN"

Write-Host "Registered Environment Domain: $DEFAULT_DOMAIN" -ForegroundColor Green

# Read optional API keys
$GROQ_API_KEY = $env:GROQ_API_KEY
if (-not $GROQ_API_KEY -and (Test-Path "$REPO_ROOT\copilot_ide\.env")) {
    Get-Content "$REPO_ROOT\copilot_ide\.env" | ForEach-Object {
        if ($_ -match "^GROQ_API_KEY=(.*)$") {
            $GROQ_API_KEY = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

# 7. Build and Push Images using Local Docker
Write-Host "🔨 Step 5/6: Building and pushing Docker images to ACR..." -ForegroundColor Cyan

Write-Host "  [1/3] Building Orchestrator Service (archon-api)..." -ForegroundColor Yellow
docker build -t "$ACR_SERVER/archon-api:latest" -f copilot_ide/services/orchestrator_service/Dockerfile.azure .
docker push "$ACR_SERVER/archon-api:latest"

Write-Host "  [2/3] Building ArcGen Microservice (archon-arcgen)..." -ForegroundColor Yellow
docker build -t "$ACR_SERVER/archon-arcgen:latest" -f copilot_ide/services/arcgen_service/Dockerfile copilot_ide/services/arcgen_service
docker push "$ACR_SERVER/archon-arcgen:latest"

Write-Host "  [3/3] Building Next.js Frontend with inlined backend endpoints..." -ForegroundColor Yellow
docker build -t "$ACR_SERVER/archon-ui:latest" `
  --build-arg "NEXT_PUBLIC_API_URL=https://$API_FQDN" `
  --build-arg "NEXT_PUBLIC_ARCGEN_API_URL=https://$ARCGEN_FQDN" `
  -f copilot_ide/frontend/Dockerfile copilot_ide/frontend
docker push "$ACR_SERVER/archon-ui:latest"

# 8. Deploy Container Apps
Write-Host "🚀 Step 6/6: Deploying Serverless Container Apps (Scale-to-Zero)..." -ForegroundColor Cyan

Write-Host "  • Launching Orchestrator Gateway (port 8000)..."
az containerapp create `
  --name "archon-api" `
  --resource-group $RG `
  --environment $ENV_NAME `
  --image "$ACR_SERVER/archon-api:latest" `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 8000 `
  --ingress external `
  --cpu 0.5 `
  --memory 1.0Gi `
  --min-replicas 0 `
  --max-replicas 1 `
  --env-vars "GROQ_API_KEY=$GROQ_API_KEY" `
  --output none

Write-Host "  • Launching ArcGen Service (port 8004)..."
az containerapp create `
  --name "archon-arcgen" `
  --resource-group $RG `
  --environment $ENV_NAME `
  --image "$ACR_SERVER/archon-arcgen:latest" `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 8004 `
  --ingress external `
  --cpu 0.5 `
  --memory 1.0Gi `
  --min-replicas 0 `
  --max-replicas 1 `
  --env-vars "GROQ_API_KEY=$GROQ_API_KEY" `
  --output none

Write-Host "  • Launching Next.js Frontend (port 3000)..."
az containerapp create `
  --name "archon-ui" `
  --resource-group $RG `
  --environment $ENV_NAME `
  --image "$ACR_SERVER/archon-ui:latest" `
  --registry-server $ACR_SERVER `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --target-port 3000 `
  --ingress external `
  --cpu 0.25 `
  --memory 0.5Gi `
  --min-replicas 0 `
  --max-replicas 1 `
  --output none

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "🎉 ARCHON COPILOT IDE IS LIVE ON AZURE!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "🌐 Archon Web IDE (UI):   https://$UI_FQDN" -ForegroundColor Yellow
Write-Host "⚡ Orchestrator Gateway:   https://$API_FQDN" -ForegroundColor Yellow
Write-Host "🏗️ ArcGen Service:        https://$ARCGEN_FQDN" -ForegroundColor Yellow
Write-Host "`n💰 Credit Protection Status:" -ForegroundColor Green
Write-Host "• min-replicas set to 0: Containers scale down to 0 when idle (`$0.00 consumed)"
Write-Host "• Free allowance: Fits within Azure's 180,000 vCPU-seconds monthly grant"
Write-Host "• Free automatic HTTPS & SSL managed by Azure"
Write-Host "======================================================================" -ForegroundColor Cyan
