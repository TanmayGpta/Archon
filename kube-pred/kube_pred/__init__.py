"""kube-pred: anomaly detection on Prometheus metrics for Kubernetes workloads.

Pipeline stage after containerisation: Prometheus -> collector -> detectors -> exporter.
Detection is deterministic statistics; LLMs are only for explaining results (later).
"""

__version__ = "0.1.0"
