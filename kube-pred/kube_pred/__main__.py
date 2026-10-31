"""
python -m kube_pred                 # serve scores on :9105/metrics, re-run every --interval seconds
python -m kube_pred --once          # one pass, print anomalous rows as JSON (use --all for every row)
"""
import argparse
import json
import logging
import os
import time
from pathlib import Path

from kube_pred.collector import PrometheusClient
from kube_pred.runner import load_config, run_once

DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config" / "signals.json"


def main() -> None:
    parser = argparse.ArgumentParser(prog="kube_pred", description="Anomaly detection on Prometheus metrics")
    parser.add_argument("--prom-url", default=os.getenv("PROM_URL", "http://localhost:9090"))
    parser.add_argument("--config", type=Path, default=Path(os.getenv("KUBE_PRED_CONFIG", DEFAULT_CONFIG)))
    parser.add_argument("--port", type=int, default=int(os.getenv("KUBE_PRED_PORT", "9105")))
    parser.add_argument("--interval", type=float, default=float(os.getenv("KUBE_PRED_INTERVAL", "30")))
    parser.add_argument("--once", action="store_true", help="run one pass and print JSON")
    parser.add_argument("--all", action="store_true", help="with --once, print normal rows too")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = load_config(args.config)
    client = PrometheusClient(args.prom_url)

    if args.once:
        rows = run_once(client, config)
        print(json.dumps([r.to_dict() for r in rows if args.all or r.anomalous], indent=2))
        return

    from kube_pred.exporter import ScoreExporter

    exporter = ScoreExporter()
    exporter.serve(args.port)
    logging.info("serving /metrics on :%d, Prometheus at %s", args.port, args.prom_url)
    while True:
        started = time.time()
        rows = run_once(client, config)
        exporter.publish(rows)
        anomalies = [r for r in rows if r.anomalous]
        logging.info("scored %d series, %d anomalous", len(rows), len(anomalies))
        for r in anomalies:
            logging.info("ANOMALY %s/%s [%s] score=%.2f", r.workload, r.signal, r.detector, r.score)
        time.sleep(max(0.0, args.interval - (time.time() - started)))


if __name__ == "__main__":
    main()
