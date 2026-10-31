#!/usr/bin/env bash
# Local lab inside WSL: kind cluster + Prometheus/Grafana + Online Boutique demo app + Chaos Mesh.
# Needs the native Docker engine in WSL, plus kind, kubectl and helm on PATH.
set -euo pipefail
LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# kind runs many pods on one kernel; the Ubuntu default of 128 inotify instances causes "too many open files".
if (( $(sysctl -n fs.inotify.max_user_instances) < 512 )); then
  echo "Raise inotify limits first (persists across reboots):"
  echo "  echo 'fs.inotify.max_user_instances = 512' | sudo tee /etc/sysctl.d/99-kind.conf && sudo sysctl --system"
  exit 1
fi

kind create cluster --config "$LAB/kind-config.yaml"

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm repo update

helm upgrade --install kube-prom prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace -f "$LAB/values-prometheus.yaml" --wait --timeout 15m

kubectl create namespace boutique
kubectl apply -n boutique -f https://raw.githubusercontent.com/GoogleCloudPlatform/microservices-demo/v0.10.1/release/kubernetes-manifests.yaml

helm upgrade --install chaos-mesh chaos-mesh/chaos-mesh \
  --namespace chaos-mesh --create-namespace \
  --set chaosDaemon.runtime=containerd --set chaosDaemon.socketPath=/run/containerd/containerd.sock \
  --wait --timeout 10m

cat <<'EOF'

Lab ready. Let the demo app run ~30 min so detectors have a baseline, then:
  kubectl -n monitoring port-forward svc/kube-prom-kube-prometheus-prometheus 9090
  kubectl -n monitoring port-forward svc/kube-prom-grafana 3001:80     (admin / admin)
WSL forwards localhost, so both open from Windows too.
EOF
