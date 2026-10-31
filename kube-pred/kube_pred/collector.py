"""Pull time series from the Prometheus HTTP API and group them by workload."""
import math
import re
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import requests

# Deployment pods are named "<workload>-<replicaset hash>-<pod hash>".
# Stripping both hashes keeps one series per workload across pod restarts.
_DEPLOYMENT_POD_SUFFIX = re.compile(r"-[a-z0-9]{6,10}-[a-z0-9]{5}$")

Series = List[Tuple[float, float]]


def workload_name(pod: str) -> str:
    """'cartservice-7d9f8c6b5-x2k4p' -> 'cartservice'. StatefulSet names are kept as-is."""
    return _DEPLOYMENT_POD_SUFFIX.sub("", pod)


class PrometheusClient:
    def __init__(self, base_url: str, timeout: float = 10.0, session: Optional[requests.Session] = None):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = session or requests.Session()

    def query_range(self, query: str, start: float, end: float, step: float) -> List[dict]:
        resp = self.session.get(
            f"{self.base_url}/api/v1/query_range",
            params={"query": query, "start": start, "end": end, "step": step},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("status") != "success":
            raise RuntimeError(f"Prometheus query failed: {body.get('error', body)}")
        return body["data"]["result"]


def fetch_signal(
    client: PrometheusClient,
    query: str,
    group_label: str = "pod",
    aggregate: str = "sum",
    window_seconds: float = 3600,
    step_seconds: float = 15,
    now: Optional[float] = None,
) -> Dict[str, Series]:
    """
    Returns {workload: [(timestamp, value), ...]} sorted by timestamp.
    Series that map to the same workload (replicas, or old and new pod after a kill)
    are merged per timestamp with `aggregate` ("sum" or "max").
    """
    if aggregate not in ("sum", "max"):
        raise ValueError(f"Unknown aggregate: {aggregate}")

    end = time.time() if now is None else now
    raw = client.query_range(query, end - window_seconds, end, step_seconds)

    merged: Dict[str, Dict[float, float]] = defaultdict(dict)
    for item in raw:
        label = item["metric"].get(group_label, "unknown")
        key = workload_name(label) if group_label == "pod" else label
        points = merged[key]
        for ts, val in item["values"]:
            value = float(val)
            if math.isnan(value) or math.isinf(value):
                continue
            ts = float(ts)
            if ts not in points:
                points[ts] = value
            elif aggregate == "sum":
                points[ts] += value
            else:
                points[ts] = max(points[ts], value)

    return {key: sorted(points.items()) for key, points in merged.items()}
