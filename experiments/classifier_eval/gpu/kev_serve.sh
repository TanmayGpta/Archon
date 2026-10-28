#!/usr/bin/env bash
# Head-node launcher: serves one fine-tuned Kev-9B checkpoint from ~/archon_clf/runs on the GPU slice.
# Lives at ~/archon_clf/kev_serve.sh next to pod.yaml and runs/ (copied there from this repo).
#   bash ~/archon_clf/kev_serve.sh start L3   pod up, Kev serving on pod:8009, forwarded to head-node 127.0.0.1:8009
#   bash ~/archon_clf/kev_serve.sh stop       delete the pod (frees the slice)
set -euo pipefail
module load kubernetes/BMU-Cluster >/dev/null 2>&1 || true
DIR=$(cd "$(dirname "$0")" && pwd)
POD=clf-dev

case "${1:-}" in
  start)
    RUN=archon-9b-${2:-L3}
    [ -d "$DIR/runs/$RUN" ] || { echo "no checkpoint $DIR/runs/$RUN" >&2; exit 1; }
    kubectl get pod $POD >/dev/null 2>&1 || kubectl apply -f "$DIR/pod.yaml"
    kubectl wait --for=condition=Ready pod/$POD --timeout=600s
    tar -cf - -C "$DIR/runs" "$RUN" | kubectl exec -i $POD -- bash -c 'mkdir -p /work/runs && tar -xf - -C /work/runs'
    kubectl exec -i $POD -- bash -s <<EOF
cd /work; export HF_HOME=/work/hf HF_HUB_DISABLE_XET=1 PIP_DISABLE_PIP_VERSION_CHECK=1
if [ ! -d kev ]; then pip install -q uv && git clone -q --depth 1 https://github.com/jaredpalmer/kev.git && (cd kev && uv sync -q --extra serve); fi
pkill -f kev.serve || true
cd kev && setsid nohup uv run --extra serve python -m kev.serve --run /work/runs/$RUN --port 8009 > /work/serve.log 2>&1 < /dev/null &
EOF
    echo "loading $RUN (a fresh pod first downloads Qwen3.5-9B-Base, ~18 GB) ..."
    until kubectl exec $POD -- curl -sf http://127.0.0.1:8009/v1/models >/dev/null 2>&1; do
      kubectl exec $POD -- pgrep -f kev.serve >/dev/null || { kubectl exec $POD -- tail -20 /work/serve.log; exit 1; }
      sleep 15
    done
    echo "ready: head-node 127.0.0.1:8009 -> $POD:8009 (Ctrl-C stops the forward, not the pod)"
    kubectl port-forward pod/$POD 8009:8009 ;;
  stop)
    kubectl delete pod $POD --wait=false ;;
  *)
    echo "usage: $0 start [L0|L1|L2|L3] | stop" >&2; exit 2 ;;
esac
