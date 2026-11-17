#!/usr/bin/env bash
# ==============================================================================
# Helper Script: Discover Allowed Azure Regions for Student Subscription
# ==============================================================================

set -euo pipefail

echo "🔍 Checking Azure Policy restrictions on your subscription..."

# 1. Query Azure Policy assignments for allowed locations
ALLOWED=$(az policy assignment list --query "[].parameters.listOfAllowedLocations.value[]" -o tsv 2>/dev/null || true)

if [[ -n "$ALLOWED" ]]; then
    echo "=========================================================="
    echo "✅ Allowed regions enforced by your Azure policy:"
    echo "$ALLOWED" | sort -u | sed 's/^/  • /'
    echo "=========================================================="
else
    echo "ℹ️ No explicit 'listOfAllowedLocations' policy found."
    echo "Listing active policies on your subscription:"
    az policy assignment list --query "[].{DisplayName:displayName, Name:name}" -o table 2>/dev/null || true
fi
