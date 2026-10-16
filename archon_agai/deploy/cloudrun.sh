#!/usr/bin/env bash
# Deploy Archon Guard to Google Cloud Run. Prereqs: gcloud auth login; a project with billing;
# secrets created once:
#   printf '%s' "$GOOGLE_API_KEY" | gcloud secrets create google-api-key --data-file=-
#   (optional) langfuse-public-key / langfuse-secret-key the same way
set -euo pipefail
PROJECT=${PROJECT:?set PROJECT}
REGION=${REGION:-asia-south1}
IMAGE="$REGION-docker.pkg.dev/$PROJECT/archon/archon-guard:latest"

gcloud artifacts repositories create archon --repository-format=docker --location="$REGION" --project "$PROJECT" 2>/dev/null || true
gcloud builds submit --project "$PROJECT" --tag "$IMAGE" --config /dev/stdin . <<EOF
steps:
- name: gcr.io/cloud-builders/docker
  args: [build, -f, archon_agai/deploy/Dockerfile, -t, "$IMAGE", .]
images: ["$IMAGE"]
EOF

SECRETS="GOOGLE_API_KEY=google-api-key:latest"
if gcloud secrets describe langfuse-secret-key --project "$PROJECT" >/dev/null 2>&1; then
  SECRETS="$SECRETS,LANGFUSE_PUBLIC_KEY=langfuse-public-key:latest,LANGFUSE_SECRET_KEY=langfuse-secret-key:latest"
fi

# 1. Healing crew (A2A server). Its public URL must be in its own agent card.
gcloud run deploy archon-healing --project "$PROJECT" --region "$REGION" --image "$IMAGE" \
  --set-env-vars SERVICE=healing --set-secrets "$SECRETS" --memory 2Gi --timeout 900 --allow-unauthenticated
HEAL_URL=$(gcloud run services describe archon-healing --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
gcloud run services update archon-healing --project "$PROJECT" --region "$REGION" --update-env-vars AGAI_HEALING_A2A_URL="$HEAL_URL"

# 2. Gateway (ADK agents + MCP + API). Single instance: sessions are in memory.
gcloud run deploy archon-gateway --project "$PROJECT" --region "$REGION" --image "$IMAGE" \
  --set-env-vars SERVICE=gateway,AGAI_HEALING_A2A_URL="$HEAL_URL" --set-secrets "$SECRETS" \
  --memory 2Gi --timeout 900 --max-instances 1 --no-cpu-throttling --allow-unauthenticated
GW_URL=$(gcloud run services describe archon-gateway --project "$PROJECT" --region "$REGION" --format 'value(status.url)')

echo "Gateway:  $GW_URL"
echo "Healing:  $HEAL_URL  (agent card: $HEAL_URL/.well-known/agent-card.json)"
echo "Frontend: deploy copilot_ide/frontend (e.g. Vercel) with NEXT_PUBLIC_AGAI_API_URL=$GW_URL, open /agai"
