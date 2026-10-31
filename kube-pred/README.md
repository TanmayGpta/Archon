# kube-pred

Anomaly detection on Prometheus metrics for Kubernetes workloads. It is the runtime stage of the Archon pipeline:

```
architecture gen -> conformance -> auto-fix -> auto-containerise -> Kubernetes -> kube-pred
```

Kubernetes heals reactively: it restarts and reschedules pods after something breaks. kube-pred adds the missing
piece. It watches metrics continuously, flags unusual behaviour early and, later, ranks the likely root cause.

Same rule as Archon core: **detection is deterministic statistics**. An LLM may explain an incident, but it never
decides whether something is anomalous.

## How it works

```
Prometheus --query_range--> collector --> detectors --> exporter (:9105/metrics)
    ^                                                        |
    +---------------- scrapes kube_pred_anomaly_score -------+
```

| File | Role |
|---|---|
| `kube_pred/collector.py` | Runs each PromQL query over the last `window_seconds` and merges pods into one series per workload (a killed pod and its replacement stay one series). |
| `kube_pred/detectors.py` | `mad` (rolling median/MAD, robust), `ewma` (adapts to drift), `zscore` (baseline). Each point is scored only against earlier points. |
| `kube_pred/runner.py` | One pass: every signal × workload × detector gives a `ScoreRow`. A broken query is logged and skipped. |
| `kube_pred/exporter.py` | `kube_pred_anomaly_score`, `kube_pred_anomaly` (0/1), `kube_pred_last_run_timestamp_seconds`. |
| `config/signals.json` | Signals (PromQL), detectors, threshold, window, and a per-signal `min_scale` (smallest change that counts, in the signal's units). Change it here; nothing is hardcoded. |

Current signals are resource (USE) metrics from cAdvisor and kube-state-metrics: CPU, memory, CPU throttling,
restarts and network. Request rate, errors and latency (RED) need a service mesh. That comes later.

## Run the tests (no cluster needed)

```powershell
cd kube-pred
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m pytest tests -q
```

## Run the lab

The cluster runs in WSL (Ubuntu-24.04) on its native Docker engine, not Docker Desktop. Inside WSL you need
`kind`, `kubectl` and `helm` in `~/.local/bin`. Run the cluster commands below in a WSL shell, from
`/mnt/c/Users/gaura/archon/kube-pred`.

```bash
./lab/setup.sh           # kind cluster, kube-prometheus-stack, Online Boutique, Chaos Mesh
```

WSL gets about half of the host's RAM by default (about 7.7 GB here). The full lab uses roughly 4–5 GB.

Wait about 30 minutes so the detectors have a baseline. Then pick one of the options below.

**Option A: run kube-pred on Windows.** WSL forwards localhost, so the Windows venv reaches the port-forward.

```bash
kubectl -n monitoring port-forward svc/kube-prom-kube-prometheus-prometheus 9090     # WSL
```
```powershell
.venv\Scripts\python.exe -m kube_pred --once --all     # one pass, print JSON
.venv\Scripts\python.exe -m kube_pred                  # serve :9105/metrics every 30 s
```

**Option B: run kube-pred in the cluster** (Prometheus scrapes it, so the scores show up in Grafana)

```bash
docker build -t kube-pred:dev .
kind load docker-image kube-pred:dev --name kube-pred
kubectl apply -f deploy/kube-pred.yaml
```

**Inject a fault and watch it get flagged**

```bash
kubectl apply -f lab/chaos/cpu-stress.yaml     # also: pod-kill.yaml, network-delay.yaml
kubectl delete -f lab/chaos/cpu-stress.yaml    # stop it early
```

Grafana query: `kube_pred_anomaly_score{workload="cartservice"}`.

## Roadmap

1. **MVP (now):** statistical detectors, exporter, lab, chaos experiments.
2. **Evaluation:** log chaos start and end times as ground truth, then measure precision, recall and time to detect.
   Compare against NAB and RCAEval.
3. **Multivariate:** Isolation Forest across signals, plus `river` for online learning.
4. **Root cause:** build a service dependency graph in NetworkX and rank root causes with personalized PageRank
   over the anomalous subgraph (MicroRCA approach). Reuses Archon's graph code.
5. **RED metrics:** add Linkerd for request rate, errors and p95 latency.
6. **Explainer:** an LLM writes the incident summary from the ranked causes, metrics and k8s events.
7. **Proactive healing:** scale, restart or cordon through the k8s API, with guardrails and a dry-run default.
8. **Archon integration:** feed Archon's architecture model in as the expected service graph, so runtime
   anomalies map back to the architecture.
