#!/usr/bin/env bash
# Head-node launcher: serves one fine-tuned Kev-9B checkpoint from ~/archon_clf/runs on the GPU slice.
# Lives at ~/archon_clf/kev_serve.sh next to pod.yaml and runs/ (the kev-agent service keeps both in sync).
#   bash ~/archon_clf/kev_serve.sh start [L3]   pod up, checkpoint in, Kev launched, port-forward kept alive
#                                               (returns once the server is launching; `status` tracks it)
#   bash ~/archon_clf/kev_serve.sh status       one line: pod=<phase> server=<ready|loading|stopped> forward=<up|down>
#   bash ~/archon_clf/kev_serve.sh stop         delete the pod (frees the slice) and the port-forward
set -uo pipefail
module load kubernetes/BMU-Cluster >/dev/null 2>&1 || true
DIR=$(cd "$(dirname "$0")" && pwd)
POD=clf-dev
FWD="kubectl port-forward --address 127.0.0.1 pod/$POD 8009:8009"

pod_phase() { kubectl get pod $POD -o jsonpath='{.status.phase}' 2>/dev/null || echo none; }

forward() {   # keep head-node 127.0.0.1:8009 -> pod:8009 alive, once
  pgrep -f "$FWD" >/dev/null && return
  setsid nohup bash -lc "module load kubernetes/BMU-Cluster >/dev/null 2>&1; while true; do $FWD; sleep 3; done" \
    > "$DIR/pf.log" 2>&1 < /dev/null &
}

case "${1:-}" in
  start)
    RUN=archon-9b-${2:-L3}
    [ -d "$DIR/runs/$RUN" ] || { echo "no checkpoint $DIR/runs/$RUN" >&2; exit 1; }
    case "$(pod_phase)" in   # an expired pod (8 h deadline) ends Failed: replace it
      Failed|Succeeded) kubectl delete pod $POD --wait=true ;;
    esac
    kubectl get pod $POD >/dev/null 2>&1 || kubectl apply -f "$DIR/pod.yaml"
    kubectl wait --for=condition=Ready pod/$POD --timeout=600s || exit 1
    if ! kubectl exec $POD -- test -d /work/runs/$RUN; then
      tar -cf - -C "$DIR/runs" "$RUN" | kubectl exec -i $POD -- bash -c 'mkdir -p /work/runs && tar -xf - -C /work/runs'
    fi
    kubectl exec -i $POD -- bash -s <<EOF
cd /work; export HF_HOME=/work/hf HF_HUB_DISABLE_XET=1 PIP_DISABLE_PIP_VERSION_CHECK=1
if pgrep -f kev.serve >/dev/null; then exit 0; fi
if [ ! -d kev ]; then pip install -q uv && git clone -q --depth 1 https://github.com/jaredpalmer/kev.git && (cd kev && uv sync -q --extra serve); fi
cd kev && setsid nohup uv run --extra serve python -m kev.serve --run /work/runs/$RUN --port 8009 > /work/serve.log 2>&1 < /dev/null &
EOF
    forward
    echo "launched $RUN (a fresh pod first downloads Qwen3.5-9B-Base, ~18 GB)" ;;
  status)
    phase=$(pod_phase); server=stopped
    if [ "$phase" = Running ]; then
      if kubectl exec $POD -- curl -sf -m 5 http://127.0.0.1:8009/v1/models >/dev/null 2>&1; then server=ready
      elif kubectl exec $POD -- pgrep -f kev.serve >/dev/null 2>&1; then server=loading; fi
    fi
    pgrep -f "$FWD" >/dev/null && fwd=up || fwd=down
    [ "$server" = ready ] && [ "$fwd" = down ] && forward && fwd=up
    echo "pod=${phase:-none} server=$server forward=$fwd" ;;
  forward)
    forward ;;
  stop)
    pkill -f "$FWD"   # matches the keep-alive loop and its kubectl
    kubectl delete pod $POD --wait=false ;;
  *)
    echo "usage: $0 start [L0|L1|L2|L3] | status | forward | stop" >&2; exit 2 ;;
esac
