"""Exports the scored benchmark for the Evaluation dashboard's "Layer classifier" tab.

    .venv/Scripts/python.exe export_benchmark.py

Same eval subset, macro-F1 and repo-level bootstrap as score.py, plus per-layer precision /
recall / F1. Only runs that cover every eval file are exported (partial Groq runs are skipped).
"""
import json
from collections import defaultdict

import numpy as np

from features import HERE, ROOT, load
from score import load_preds, macro_f1
from vocab import LAYERS

OUT = ROOT / "copilot_ide/frontend/src/app/components/evaluation/classifierBenchmarkData.json"
BASELINE = "groq-prod-L0"
MIN_GAIN = 0.03
INPUT = {"L0": "path", "L1": "+ imports", "L2": "+ signatures", "L3": "+ source"}
TOKENS = {"L0": 13, "L1": 46, "L2": 217, "L3": 830}   # mean input tokens per file on the eval subset

# name -> (label, family, level, fine-tuned, note); order = display order within a family
CANDIDATES = {
    "kev-9b-ft-L3":   ("Kev-9B fine-tuned", "Kev", "L3", True, "Conformance: 'precise'"),
    "kev-9b-ftL3-L2": ("Kev-9B fine-tuned (L3 model)", "Kev", "L2", True, "Conformance: 'token-efficient'"),
    "kev-9b-ft-L2":   ("Kev-9B fine-tuned", "Kev", "L2", True, ""),
    "kev-9b-ft-L1":   ("Kev-9B fine-tuned", "Kev", "L1", True, ""),
    "kev-9b-ft-L0":   ("Kev-9B fine-tuned", "Kev", "L0", True, ""),
    "kev-9b-L3":      ("Kev-9B zero-shot", "Kev", "L3", False, ""),
    "kev-9b-L2":      ("Kev-9B zero-shot", "Kev", "L2", False, ""),
    "kev-9b-L1":      ("Kev-9B zero-shot", "Kev", "L1", False, ""),
    "kev-9b-L0":      ("Kev-9B zero-shot", "Kev", "L0", False, ""),
    "kev-4b-L3":      ("Kev-4B zero-shot", "Kev", "L3", False, ""),
    "groq-rich-L1":   ("Groq gpt-oss-120b, test prompt", "Groq", "L1", False, ""),
    "groq-prod-L1":   ("Groq gpt-oss-120b, shipped prompt", "Groq", "L1", False, "Reverted (missed the gate)"),
    "groq-prod-L0":   ("Groq gpt-oss-120b, names only", "Groq", "L0", False, "Baseline (previous production)"),
    "laya-typed-L3":  ("Laya typed-decisions", "Laya", "L3", False, ""),
    "laya-L3":        ("Laya", "Laya", "L3", False, ""),
    "laya-ml8k-L3":   ("Laya multilingual 8k", "Laya", "L3", False, ""),
    "import-rule":    ("Import-keyword rule", "Floor", "L1", False, ""),
    "majority":       ("Majority class", "Floor", "L0", False, ""),
}
MS_PER_FILE = {"kev-9b-ft-L3": 237, "kev-9b-ftL3-L2": 115, "kev-9b-ft-L2": 120, "kev-9b-ft-L1": 90,
               "kev-9b-ft-L0": 83, "kev-9b-L3": 207, "kev-9b-L2": 102, "kev-9b-L1": 77, "kev-9b-L0": 73}


def per_layer(gold, pred):
    out = {}
    for c in LAYERS:
        tp = int(np.sum((pred == c) & (gold == c)))
        fp = int(np.sum((pred == c) & (gold != c)))
        fn = int(np.sum((pred != c) & (gold == c)))
        out[c] = {
            "precision": round(tp / (tp + fp), 3) if tp + fp else 0.0,
            "recall": round(tp / (tp + fn), 3) if tp + fn else 0.0,
            "f1": round(2 * tp / (2 * tp + fp + fn), 3) if tp + fp + fn else 0.0,
            "support": int(np.sum(gold == c)),
        }
    return out


def main():
    rows = load(eval_only=True)
    ids = [r["id"] for r in rows]
    gold = np.array([r["label"] for r in rows])
    repo_idx = defaultdict(list)
    for i, r in enumerate(rows):
        repo_idx[r["repo"]].append(i)
    groups = list(repo_idx.values())
    rng = np.random.default_rng(0)
    resamples = [np.concatenate([groups[g] for g in rng.integers(0, len(groups), len(groups))]) for _ in range(2000)]

    base, _ = load_preds(HERE / "preds" / f"{BASELINE}.jsonl", ids)
    base_boot = [macro_f1(gold[s], base[s])[0] for s in resamples]
    out = []
    for name, (label, family, level, ft, note) in CANDIDATES.items():
        path = HERE / "preds" / f"{name}.jsonl"
        if not path.exists():
            continue
        pred, covered = load_preds(path, ids)
        if covered < len(ids):
            print(f"skip {name}: {covered}/{len(ids)} files")
            continue
        f1, _ = macro_f1(gold, pred)
        boot = [macro_f1(gold[s], pred[s])[0] for s in resamples]
        entry = {
            "id": name, "label": label, "family": family, "level": level, "input": INPUT[level],
            "fineTuned": ft, "note": note,
            "macroF1": round(f1, 3), "ci": [round(float(x), 3) for x in np.percentile(boot, [2.5, 97.5])],
            "accuracy": round(float(np.mean(pred == gold)), 3),
            "perLayer": per_layer(gold, pred),
            "tokensPerFile": TOKENS[level] if family in ("Kev", "Groq", "Laya") else 0,
            "msPerFile": MS_PER_FILE.get(name),
        }
        if name != BASELINE:
            d = np.array(boot) - np.array(base_boot)
            lo, hi = np.percentile(d, [2.5, 97.5])
            entry.update(gain=round(f1 - macro_f1(gold, base)[0], 3), gainCi=[round(float(lo), 3), round(float(hi), 3)],
                         passes=bool(lo > MIN_GAIN))
        out.append(entry)

    meta = {
        "evalFiles": len(rows), "testRepos": len(groups), "baseline": BASELINE, "minGain": MIN_GAIN,
        "layers": LAYERS, "support": {c: int(np.sum(gold == c)) for c in LAYERS},
        "trainRepos": len({r["repo"] for r in load("train")}), "trainFiles": len(load("train")),
    }
    OUT.write_text(json.dumps({"meta": meta, "candidates": out}, indent=1), encoding="utf-8")
    print(f"wrote {len(out)} candidates -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
