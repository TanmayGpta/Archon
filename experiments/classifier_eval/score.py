"""Scores every preds/*.jsonl against the eval subset and applies the adoption gate.

    python score.py --baseline groq-prod-L0

Confidence intervals come from a repo-level (cluster) bootstrap, because files within a
repo are not independent. The gate is paired: each resample scores the candidate and the
baseline on the same repos, and a candidate passes only if the lower 95% bound of its
macro-F1 gain is above --min-gain. Missing or 'unclassified' predictions count as wrong.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from features import HERE, load
from vocab import LAYERS


def macro_f1(gold, pred):
    f1s = []
    for c in LAYERS:
        tp = np.sum((pred == c) & (gold == c))
        fp = np.sum((pred == c) & (gold != c))
        fn = np.sum((pred != c) & (gold == c))
        f1s.append(2 * tp / (2 * tp + fp + fn) if tp + fp + fn else 0.0)
    return float(np.mean(f1s)), f1s


def load_preds(path, ids):
    p = {}
    for line in Path(path).open(encoding="utf-8"):
        d = json.loads(line)
        p[d["id"]] = d["pred"]
    return np.array([p.get(i, "unclassified") for i in ids]), sum(i in p for i in ids)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default="groq-prod-L0")
    ap.add_argument("--min-gain", type=float, default=0.03, help="required macro-F1 gain at the CI lower bound")
    ap.add_argument("--boot", type=int, default=2000)
    args = ap.parse_args()

    rows = load(eval_only=True)
    ids = [r["id"] for r in rows]
    gold = np.array([r["label"] for r in rows])
    repo_idx = defaultdict(list)
    for i, r in enumerate(rows):
        repo_idx[r["repo"]].append(i)
    groups = list(repo_idx.values())
    rng = np.random.default_rng(0)
    resamples = [np.concatenate([groups[g] for g in rng.integers(0, len(groups), len(groups))])
                 for _ in range(args.boot)]

    preds = {p.stem: load_preds(p, ids) for p in sorted((HERE / "preds").glob("*.jsonl"))}
    if not preds:
        raise SystemExit("no preds/*.jsonl yet")
    base = preds.get(args.baseline, (None,))[0]

    print(f"eval subset: {len(rows)} files from {len(groups)} held-out repos\n")
    print(f"{'candidate':24} {'cover':>6} {'acc':>6} {'macroF1':>8} {'95% CI':>15}   "
          + " ".join(f"{c[:5]:>6}" for c in LAYERS) + f"   gain vs {args.baseline}")
    for name, (pred, covered) in sorted(preds.items(), key=lambda kv: -macro_f1(gold, kv[1][0])[0]):
        f1, per = macro_f1(gold, pred)
        boot = [macro_f1(gold[s], pred[s])[0] for s in resamples]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        line = (f"{name:24} {covered / len(ids):6.0%} {np.mean(pred == gold):6.3f} {f1:8.3f} "
                f"[{lo:.3f}, {hi:.3f}]   " + " ".join(f"{x:6.3f}" for x in per))
        if base is not None and name != args.baseline:
            d = [macro_f1(gold[s], pred[s])[0] - macro_f1(gold[s], base[s])[0] for s in resamples]
            dlo, dhi = np.percentile(d, [2.5, 97.5])
            verdict = "PASS" if dlo > args.min_gain else "fail"
            line += f"   {f1 - macro_f1(gold, base)[0]:+.3f} [{dlo:+.3f}, {dhi:+.3f}] {verdict}"
        print(line)
    if base is None:
        print(f"\n(no preds/{args.baseline}.jsonl, so no gate yet)")


if __name__ == "__main__":
    main()
