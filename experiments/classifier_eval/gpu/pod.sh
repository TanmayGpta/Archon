#!/usr/bin/env bash
# Local helper (Git Bash) for the clf-dev pod behind the college head node.
#   CLF_HOST=<user>@<head node> gpu/pod.sh push            harness + fixtures + dataset -> pod:/work
#   gpu/pod.sh run '<cmd>'     run a shell command in the pod (from /work)
#   gpu/pod.sh pull            pod preds/ -> local preds/
set -euo pipefail
HOST=${CLF_HOST:?set CLF_HOST=<user>@<head node>}
POD=${CLF_POD:-clf-dev}
EVAL=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$EVAL/../.." && pwd)
kube() { ssh -o BatchMode=yes "$HOST" "bash -lc 'module load kubernetes/BMU-Cluster >/dev/null 2>&1; kubectl $*'"; }

case "$1" in
  push)
    tar -C "$ROOT" -cf - --exclude=.venv --exclude=preds --exclude=__pycache__ \
        experiments/classifier_eval shared/fixtures \
      | kube exec -i "$POD" -- tar -xf - -C /work ;;
  run)
    printf '%s\n' "cd /work; $2" | kube exec -i "$POD" -- bash -s ;;
  pull)
    mkdir -p "$EVAL/preds"
    kube exec "$POD" -- tar -cf - -C /work/experiments/classifier_eval preds | tar -xf - -C "$EVAL" ;;
  *) echo "usage: $0 push|run '<cmd>'|pull" >&2; exit 2 ;;
esac
