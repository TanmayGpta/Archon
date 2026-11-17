#!/usr/bin/env bash
# ==============================================================================
# Discover the Allowed Region for Azure for Students Subscription
# Uses non-destructive preflight validation to test candidate regions.
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo "🔍 Azure for Students Region Auto-Discovery"
echo "======================================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/acr_probe.json"
TEST_RG="archon-policy-probe-rg"

# 1. First, check if policy parameters reveal the list directly
echo "📋 Inspecting policy assignments..."
POLICIES=$(az policy assignment list --query "[].{name:displayName, params:parameters}" -o json 2>/dev/null || echo "[]")
echo "$POLICIES" | grep -iE 'location|region|best available' || true

# 2. List of candidate regions open to Azure for Students
CANDIDATE_REGIONS=(
    "centralindia"
    "swedencentral"
    "southcentralus"
    "eastus2"
    "westeurope"
    "northeurope"
    "uksouth"
    "southindia"
    "canadacentral"
    "francecentral"
    "germanywestcentral"
)

FOUND_REGION=""

echo ""
echo "🧪 Running non-destructive preflight checks across candidate regions..."
for REG in "${CANDIDATE_REGIONS[@]}"; do
    echo -n "• Testing region '$REG' ... "
    
    # Create or update temporary probe resource group
    az group create --name "$TEST_RG" --location "$REG" --output none 2>/dev/null || {
        echo "❌ Disallowed (RG)"
        continue
    }

    # Run ARM preflight deployment validation (dry-run, charges $0)
    VALIDATION_OUTPUT=$(az deployment group validate \
        --resource-group "$TEST_RG" \
        --template-file "$TEMPLATE_FILE" \
        --output json 2>&1 || true)

    if echo "$VALIDATION_OUTPUT" | grep -qi "RequestDisallowedByAzure"; then
        echo "❌ Disallowed by policy"
    elif echo "$VALIDATION_OUTPUT" | grep -qi '"error": null' || echo "$VALIDATION_OUTPUT" | grep -qi '"provisioningState": "Succeeded"'; then
        echo "✅ ALLOWED!"
        FOUND_REGION="$REG"
        break
    else
        # Check if error is something other than policy (e.g. name conflict is fine, policy passed)
        if ! echo "$VALIDATION_OUTPUT" | grep -qi "Disallowed"; then
            echo "✅ ALLOWED (Preflight OK)!"
            FOUND_REGION="$REG"
            break
        else
            echo "❌ Disallowed"
        fi
    fi
done

# Clean up probe RG
echo "🧹 Cleaning up probe resource group..."
az group delete --name "$TEST_RG" --yes --no-wait 2>/dev/null || true

echo ""
if [[ -n "$FOUND_REGION" ]]; then
    echo "======================================================================"
    echo "🎉 SUCCESS: Found an allowed region for your subscription: $FOUND_REGION"
    echo "$FOUND_REGION" > "$SCRIPT_DIR/../.azure_region"
    echo "💾 Saved to copilot_ide/.azure_region"
    echo "======================================================================"
    echo "👉 Now run deployment with this region:"
    echo "   bash copilot_ide/scripts/deploy_azure.sh $FOUND_REGION"
    echo "======================================================================"
else
    echo "⚠️ Could not auto-detect an open region from standard candidates."
    echo "Please check the Azure Portal -> Policy -> Compliance for your assigned region."
fi
