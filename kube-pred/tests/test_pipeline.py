"""Collector, runner and exporter tested against a fake Prometheus (no cluster needed)."""
from prometheus_client import CollectorRegistry, generate_latest

from kube_pred.collector import fetch_signal, workload_name
from kube_pred.exporter import ScoreExporter
from kube_pred.runner import run_once


class FakePrometheus:
    def __init__(self, results_by_query):
        self.results_by_query = results_by_query

    def query_range(self, query, start, end, step):
        result = self.results_by_query[query]
        if isinstance(result, Exception):
            raise result
        return result


def series(pod, values, start=0):
    return {"metric": {"pod": pod}, "values": [[start + 15 * i, str(v)] for i, v in enumerate(values)]}


def test_workload_name():
    assert workload_name("cartservice-7d9f8c6b5-x2k4p") == "cartservice"
    assert workload_name("redis-cart-5b7f9d8c4f-abcde") == "redis-cart"
    assert workload_name("postgres-0") == "postgres-0"


def test_fetch_merges_old_and_new_pod_of_same_workload():
    # Old pod killed at t=30, new pod takes over: one continuous series.
    fake = FakePrometheus({"q": [
        series("cart-7d9f8c6b5-aaaaa", [1, 1, 1]),
        series("cart-7d9f8c6b5-bbbbb", [2, 2], start=30),
        series("frontend-6c8d9e7f5b-ccccc", [5, "NaN"]),
    ]})
    out = fetch_signal(fake, "q", now=1000)
    assert out["cart"] == [(0.0, 1.0), (15.0, 1.0), (30.0, 3.0), (45.0, 2.0)]
    assert out["frontend"] == [(0.0, 5.0)]


def test_fetch_max_aggregate():
    fake = FakePrometheus({"q": [series("a-7d9f8c6b5-aaaaa", [0.2]), series("a-7d9f8c6b5-bbbbb", [0.7])]})
    assert fetch_signal(fake, "q", aggregate="max", now=0)["a"] == [(0.0, 0.7)]


def test_run_once_flags_spike_and_survives_broken_query():
    normal = [10, 11] * 50
    fake = FakePrometheus({
        "cpu": [series("cart-7d9f8c6b5-aaaaa", normal + [40]), series("frontend-6c8d9e7f5b-bbbbb", normal + [10])],
        "broken": RuntimeError("bad PromQL"),
    })
    config = {
        "detectors": ["mad"],
        "signals": [{"name": "cpu", "query": "cpu"}, {"name": "broken", "query": "broken"}],
    }
    rows = {(r.signal, r.workload): r for r in run_once(fake, config, now=0)}
    assert rows[("cpu", "cart")].anomalous
    assert not rows[("cpu", "frontend")].anomalous
    assert not any(signal == "broken" for signal, _ in rows)


def test_exporter_publishes_and_drops_stale_series():
    from kube_pred.runner import ScoreRow

    registry = CollectorRegistry()
    exporter = ScoreExporter(registry)
    exporter.publish([ScoreRow("cpu", "cart", "mad", 7.5, True), ScoreRow("cpu", "frontend", "mad", 0.2, False)])
    text = generate_latest(registry).decode()
    assert 'kube_pred_anomaly_score{detector="mad",signal="cpu",workload="cart"} 7.5' in text
    assert 'kube_pred_anomaly{detector="mad",signal="cpu",workload="cart"} 1.0' in text

    exporter.publish([ScoreRow("cpu", "frontend", "mad", 0.1, False)])
    text = generate_latest(registry).decode()
    assert 'workload="cart"' not in text
    assert 'workload="frontend"' in text
