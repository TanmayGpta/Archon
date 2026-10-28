"""Writes Kev fine-tuning data (kev.data.load_records format) from the dataset's train/dev splits.

    python gpu/make_kev_data.py --level L3      # -> data/kev_train_L3.jsonl, data/kev_dev_L3.jsonl

The test split is never written here: it is only scored, once, through predict_decision.py.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from features import HERE, load, render  # noqa: E402
from predict_decision import question  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", default="L3")
    args = ap.parse_args()
    for split in ("train", "dev"):
        out = HERE / "data" / f"kev_{split}_{args.level}.jsonl"
        rows = load(split=split)
        with out.open("w", encoding="utf-8") as fh:
            for r in rows:
                q = question()
                q["layer"]["label"] = r["label"]
                fh.write(json.dumps({"state": render(r, args.level), "questions": q}) + "\n")
        print(f"{out.name}: {len(rows)} records")


if __name__ == "__main__":
    main()
