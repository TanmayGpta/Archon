# Rolls the Azure Container Apps onto a specific commit's images (no Service Principal needed).
# Uses your own `az login` session.
# Usage:
#   ./archon_agai/deploy/update-containerapps.ps1 -Sha <full-commit-sha>
#   ./archon_agai/deploy/update-containerapps.ps1            # uses latest origin/agai-dev commit
#   ./archon_agai/deploy/update-containerapps.ps1 -Only backend

param(
    [string]$Sha,
    [ValidateSet('both', 'backend', 'frontend')]
    [string]$Only = 'both'
)

$ErrorActionPreference = 'Stop'

$Subscription  = '55b383ce-c38c-4f9c-9e91-ff29d0f114a5'
$ResourceGroup = 'Archon'
$Registry      = 'archonregistery-ahhzb5aedsa5fdae.azurecr.io'
$BackendApp    = 'archon-agai-backend'
$FrontendApp   = 'archon-agai-frontend'
$BackendUrl    = 'https://archon-agai-backend.wittymeadow-d0c20aa4.eastasia.azurecontainerapps.io'

if (-not $Sha) {
    git fetch origin agai-dev --quiet
    $Sha = (git rev-parse origin/agai-dev).Trim()
    Write-Host "No -Sha given; using origin/agai-dev = $Sha"
}
if ($Sha -notmatch '^[0-9a-f]{40}$') {
    throw "Sha must be the full 40-char commit SHA (that's what CI tags images with). Got: $Sha"
}

# Ensure az CLI is in PATH even if terminal was opened before installation
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    $cliPath = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin"
    if (Test-Path $cliPath) {
        $env:Path = "$cliPath;$env:Path"
    }
}

# Ensure logged in + right subscription
az account show --only-show-errors 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { az login --only-show-errors 1>$null }
az account set --subscription $Subscription

function Update-App($app, $image) {
    Write-Host "`n==> $app -> $image"
    az containerapp update --name $app --resource-group $ResourceGroup --image $image --only-show-errors `
        --query "{revision:properties.latestRevisionName, status:properties.provisioningState}" -o table
    if ($LASTEXITCODE -ne 0) { throw "Update failed for $app" }
}

if ($Only -in 'both', 'backend')  { Update-App $BackendApp  "$Registry/archon-backend:$Sha" }
if ($Only -in 'both', 'frontend') { Update-App $FrontendApp "$Registry/archon-frontend:$Sha" }

if ($Only -in 'both', 'backend') {
    Write-Host "`n==> Checking backend /api/workspace/projects (may take ~1 min to warm up)"
    foreach ($i in 1..12) {
        try {
            $code = (Invoke-WebRequest "$BackendUrl/api/workspace/projects" -UseBasicParsing -TimeoutSec 15).StatusCode
        } catch { $code = $_.Exception.Response.StatusCode.value__ }
        Write-Host "  attempt $i -> HTTP $code"
        if ($code -eq 200) { break }
        Start-Sleep -Seconds 10
    }
}

Write-Host "`nDone. Open: https://archon-agai-frontend.wittymeadow-d0c20aa4.eastasia.azurecontainerapps.io/agai"
