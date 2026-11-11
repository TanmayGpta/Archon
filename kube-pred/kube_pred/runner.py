"""One detection pass: for every signal in the config, fetch series and score the latest point."""
import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List, Optional

from kube_pred.collector import PrometheusClient, fetch_signal
from kube_pred.detectors import ABS_SCALE_FLOOR, score_series

log = logging.getLogger("kube_pred")


@dataclass
class ScoreRow:
    signal: str
    workload: str
    detector: str
    score: float
    anomalous: bool

    def to_dict(self) -> dict:
        return asdict(self)


def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def run_once(client: PrometheusClient, config: dict, now: Optional[float] = None) -> List[ScoreRow]:
    params = {
        "baseline": config.get("baseline_points", 120),
        "min_baseline": config.get("min_baseline_points", 20),
        "span": config.get("ewma_span", 40),
    }
    threshold = config.get("threshold", 3.5)
    rows: List[ScoreRow] = []

    for signal in config["signals"]:
        try:
            series = fetch_signal(
                client,
                signal["query"],
                group_label=signal.get("group_label", "pod"),
                aggregate=signal.get("aggregate", "sum"),
                window_seconds=config.get("window_seconds", 3600),
                step_seconds=config.get("step_seconds", 15),
                now=now,
            )
        except Exception as exc:  # one broken query must not stop the other signals
            log.warning("signal %s failed: %s", signal["name"], exc)
            continue

        signal_params = {**params, "min_scale": signal.get("min_scale", ABS_SCALE_FLOOR)}
        for workload, points in series.items():
            values = [value for _, value in points]
            for detector in config["detectors"]:
                score = float(score_series(values, detector, **signal_params)[-1]) if values else 0.0
                rows.append(ScoreRow(signal["name"], workload, detector, round(score, 3), abs(score) >= threshold))

    return rows
