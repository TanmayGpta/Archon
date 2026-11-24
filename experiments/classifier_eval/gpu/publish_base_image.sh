#!/usr/bin/env bash
# Package and push the pre-baked Kev-9B base image (Python 3.13 + kev .venv + Qwen/Qwen3.5-9B-Base)
# directly from the running clf-dev pod on the college DGX cluster to ghcr.io via `crane`.
#
# Usage:
#   bash experiments/classifier_eval/gpu/publish_base_image.sh
#
# Requirements:
#   - Pod `clf-dev` is Running with /work/kev/.venv and /work/hf/hub/models--Qwen--Qwen3.5-9B-Base populated
#   - A GitHub Classic PAT with `write:packages` scope (prompted securely; never stored or echoed)
set -euo pipefail

CLF_HOST="${CLF_HOST:-dgx-s-bmu-soet-230798@10.1.0.176}"
POD="${CLF_POD:-clf-dev}"
BASE_IMG="docker.io/library/python@sha256:f0a8a66d747c5bde554d1e5d49551d25d2a97e376662d3231163ac7dad541042"
DEFAULT_USER="gaurav-py-ghosh"
IMAGE_NAME="${IMAGE_NAME:-archon-kev-base}"
IMAGE_TAG="${IMAGE_TAG:-qwen35-9b}"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=20)
NEED_CLEANUP=0

remote_kube() {
  local script="module load kubernetes/BMU-Cluster >/dev/null 2>&1; $1"
  ssh "${SSH_OPTS[@]}" "$CLF_HOST" "bash -lc $(printf '%q' "$script")"
}

cleanup() {
  if [ "$NEED_CLEANUP" -eq 1 ]; then
    echo ""
    echo "Cleaning up /tmp/crane_push in pod $POD..."
    remote_kube "kubectl exec $POD -- rm -rf /tmp/crane_push >/dev/null 2>&1 || true" </dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Checking DGX pod $POD on $CLF_HOST..."
remote_kube "kubectl exec -i $POD -- bash -s" <<'EOS'
set -euo pipefail
[ -x /work/kev/.venv/bin/python ] || { echo "ERROR: /work/kev/.venv/bin/python not found in pod" >&2; exit 1; }
[ -d /work/hf/hub/models--Qwen--Qwen3.5-9B-Base/snapshots ] || { echo "ERROR: Qwen3.5-9B-Base snapshot not found in /work/hf" >&2; exit 1; }
echo "    Pod check OK: /work/kev/.venv and Qwen/Qwen3.5-9B-Base are present."
EOS

echo ""
read -rp "GitHub username (lowercase for ghcr.io) [$DEFAULT_USER]: " INPUT_USER
GH_USER="${INPUT_USER:-$DEFAULT_USER}"
GH_USER="${GH_USER,,}"
if [[ ! "$GH_USER" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
  echo "ERROR: Invalid GitHub username for ghcr.io: '$GH_USER'" >&2
  exit 1
fi

echo "Create a Classic PAT with 'write:packages' scope if needed:"
echo "  https://github.com/settings/tokens/new?scopes=write:packages&description=archon-kev-ghcr"
read -rsp "GitHub Classic PAT (hidden input): " GH_TOKEN
echo ""
if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: Token cannot be empty." >&2
  exit 1
fi

IMAGE_REF="ghcr.io/${GH_USER}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "==> Target image: $IMAGE_REF"

NEED_CLEANUP=1

echo "==> Step 1/4: Installing crane in pod $POD and verifying GHCR login..."
remote_kube "kubectl exec -i $POD -- bash -s" <<'EOS'
set -euo pipefail
rm -rf /tmp/crane_push
mkdir -p /tmp/crane_push/auth
VER=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/google/go-containerregistry/releases/latest | xargs basename)
[ -n "$VER" ] || { echo "ERROR: Failed to resolve latest crane release version" >&2; exit 1; }
curl -fsSL "https://github.com/google/go-containerregistry/releases/download/${VER}/go-containerregistry_Linux_x86_64.tar.gz" \
  | tar -xz -C /tmp/crane_push crane
echo "    Installed crane $(/tmp/crane_push/crane version)"
EOS

printf '%s\n' "$GH_TOKEN" | remote_kube "kubectl exec -i $POD -- env DOCKER_CONFIG=/tmp/crane_push/auth /tmp/crane_push/crane auth login ghcr.io -u $GH_USER --password-stdin"
unset GH_TOKEN

echo "==> Step 2/4: Packaging /work/kev + Qwen3.5-9B-Base layers in parallel inside $POD..."
remote_kube "kubectl exec -i $POD -- bash -s" <<'EOS'
set -euo pipefail
pids=()

(
  cd /
  tar --exclude='work/kev/.git' \
      --exclude='work/kev/runs' \
      --exclude='work/kev/evals' \
      --exclude='__pycache__' \
      -cf - \
      work/kev \
      usr/local/bin/uv \
      usr/local/lib/python3.13/site-packages/uv \
      usr/local/lib/python3.13/site-packages/uv-*.dist-info \
    | gzip -1 > /tmp/crane_push/01-kev-venv.tar.gz
) &
pids+=($!)

(
  cd /
  find work/hf \( -type f -size +100M \) -prune -o -print0 \
    | tar --null --no-recursion -T - -cf - \
    | gzip -1 > /tmp/crane_push/02-hf-meta.tar.gz
) &
pids+=($!)

idx=0
while IFS= read -r -d '' f; do
  idx=$((idx + 1))
  out=$(printf '/tmp/crane_push/03-hf-blob-%02d.tar.gz' "$idx")
  (
    cd /
    tar -cf - "$f" | gzip -1 > "$out"
  ) &
  pids+=($!)
done < <(cd / && find work/hf -type f -size +100M -print0 | sort -z)

if [ "$idx" -eq 0 ]; then
  echo "ERROR: No >100M model shard files found under /work/hf" >&2
  exit 1
fi

for p in "${pids[@]}"; do
  wait "$p"
done

echo "    Packaged layers:"
ls -lh /tmp/crane_push/*.tar.gz
MAX_BYTES=10200547328   # 9.5 GiB guard (below GHCR's 10 GB layer cap)
for f in /tmp/crane_push/*.tar.gz; do
  sz=$(stat -c '%s' "$f")
  if [ "$sz" -gt "$MAX_BYTES" ]; then
    echo "ERROR: Layer $f is $sz bytes (exceeds 9.5 GiB safety cap)" >&2
    exit 1
  fi
done
EOS

echo "==> Step 3/4: Pushing base + layers sequentially to $IMAGE_REF (college fiber, ~3-5 min)..."
remote_kube "kubectl exec -i $POD -- bash -s -- '$BASE_IMG' '$IMAGE_REF'" <<'EOS'
set -euo pipefail
BASE_IMG="$1"
IMAGE_REF="$2"
export DOCKER_CONFIG=/tmp/crane_push/auth
CRANE=/tmp/crane_push/crane

echo "    Pushing base + 01-kev-venv + 02-hf-meta..."
"$CRANE" --platform linux/amd64 append \
  --base "$BASE_IMG" \
  -f /tmp/crane_push/01-kev-venv.tar.gz \
  -f /tmp/crane_push/02-hf-meta.tar.gz \
  --new_tag "$IMAGE_REF"

for blob_tar in /tmp/crane_push/03-hf-blob-*.tar.gz; do
  echo "    Appending $(basename "$blob_tar")..."
  "$CRANE" --platform linux/amd64 append \
    --base "$IMAGE_REF" \
    -f "$blob_tar" \
    --new_tag "$IMAGE_REF"
done

echo "==> Step 4/4: Setting container env and workdir metadata..."
"$CRANE" --platform linux/amd64 mutate "$IMAGE_REF" \
  --env HF_HOME=/work/hf \
  --env HF_HUB_DISABLE_XET=1 \
  --env PIP_DISABLE_PIP_VERSION_CHECK=1 \
  --workdir /work \
  --tag "$IMAGE_REF"

echo "    Verify remote manifest:"
"$CRANE" --platform linux/amd64 manifest "$IMAGE_REF" | head -c 400
echo ""
EOS

echo ""
echo "========================================================================"
echo "SUCCESS: Pushed $IMAGE_REF"
echo ""
echo "Next step:"
echo "  1. Open package settings and switch visibility to PUBLIC (so Kubernetes nodes pull without extra secrets):"
echo "     https://github.com/users/${GH_USER}/packages/container/${IMAGE_NAME}/settings"
echo "  2. Once set to Public, tell the assistant so we can update pod.yaml and verify a fast cold start."
echo "========================================================================"
