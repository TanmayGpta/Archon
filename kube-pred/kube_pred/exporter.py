"""Expose anomaly scores on /metrics so Prometheus scrapes them back and Grafana can plot them."""
from typing import Iterable, Optional, Set, Tuple

from prometheus_client import REGISTRY, CollectorRegistry, Gauge, start_http_server

from kube_pred.runner import ScoreRow

LABELS = ["signal", "workload", "detector"]


class ScoreExporter:
    def __init__(self, registry: Optional[CollectorRegistry] = None):
        registry = registry or REGISTRY
        self.score = Gauge("kube_pred_anomaly_score", "Signed z-like anomaly score of the latest point", LABELS, registry=registry)
        self.flag = Gauge("kube_pred_anomaly", "1 when |score| >= threshold", LABELS, registry=registry)
        self.last_run = Gauge("kube_pred_last_run_timestamp_seconds", "Unix time of the last detection run", registry=registry)
        self._live: Set[Tuple[str, str, str]] = set()

    def publish(self, rows: Iterable[ScoreRow]) -> None:
        seen = set()
        for row in rows:
            labels = (row.signal, row.workload, row.detector)
            self.score.labels(*labels).set(row.score)
            self.flag.labels(*labels).set(1 if row.anomalous else 0)
            seen.add(labels)
        # Drop series for workloads that disappeared, so Grafana does not show frozen values.
        for labels in self._live - seen:
            self.score.remove(*labels)
            self.flag.remove(*labels)
        self._live = seen
        self.last_run.set_to_current_time()

    @staticmethod
    def serve(port: int) -> None:
        start_http_server(port)
