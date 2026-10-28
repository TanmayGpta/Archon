"""Decision-model (Kev / Laya) predictions on the eval subset, one choice question per module.

    python gpu/predict_decision.py --backend kev  --target http://127.0.0.1:8009 --name kev-4b
    python gpu/predict_decision.py --backend laya --target convaiinnovations/laya --name laya

The state is the module rendered at each level (features.render); the options are the
ruleset's layer descriptions, the same text the LLM baseline sees.
"""
import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from features import HERE, LEVELS, layer_descriptions, load, render  # noqa: E402

INSTRUCTIONS = ("This is one Python module from a codebase that follows Clean Architecture. "
                "Which architectural layer does the module belong to?")


def question():
    return {"layer": {"type": "choice", "instructions": INSTRUCTIONS, "criteria": layer_descriptions()}}


def kev_predictor(url):
    def predict(state):
        body = json.dumps({"state": state, "model": "kev-latest", "questions": question()}).encode()
        req = urllib.request.Request(f"{url}/v1/systemone", body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            ans = json.load(r)["answers"]["layer"]
        return ans["choice"], float(ans.get("confidence", 0.0))
    return predict


def laya_predictor(repo, max_len):
    import laya
    agent = laya.load(repo)
    extra = {"max_len": max_len} if max_len else {}

    def predict(state):
        ans = agent.predict(state, question(), **extra)["answers"]["layer"]
        probs = ans.get("probabilities") or {}
        return ans["choice"], float(ans.get("confidence", max(probs.values(), default=0.0)))
    return predict


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=["kev", "laya"], required=True)
    ap.add_argument("--target", required=True, help="kev server URL, or laya HF repo / local dir")
    ap.add_argument("--name", required=True)
    ap.add_argument("--levels", nargs="+", default=list(LEVELS))
    ap.add_argument("--max-len", type=int, default=0, help="laya only, e.g. 8192 for laya-multilingual")
    args = ap.parse_args()

    predict = kev_predictor(args.target) if args.backend == "kev" else laya_predictor(args.target, args.max_len)
    rows = load(eval_only=True)
    (HERE / "preds").mkdir(exist_ok=True)
    for level in args.levels:
        out = HERE / "preds" / f"{args.name}-{level}.jsonl"
        t0, errors = time.time(), 0
        with out.open("w", encoding="utf-8") as fh:
            for r in rows:
                try:
                    pred, conf = predict(render(r, level))
                except Exception as e:
                    errors += 1
                    if errors <= 3:
                        print(f"  {r['id']}: {str(e)[:200]}")
                    pred, conf = "unclassified", 0.0
                fh.write(json.dumps({"id": r["id"], "pred": pred, "conf": conf}) + "\n")
        dt = time.time() - t0
        print(f"{out.name}: {len(rows)} modules in {dt:.0f}s ({1000 * dt / len(rows):.0f} ms each), {errors} errors")


if __name__ == "__main__":
    main()
