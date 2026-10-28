"""LLM predictions on the eval subset, written to preds/<name>.jsonl (resumable).

    python predict_llm.py --mode prod                 # production classify_modules, names only (the baseline)
    python predict_llm.py --mode prod --level L1      # production classify_modules with module_imports
    python predict_llm.py --mode rich --level L2      # same model + schema, richer input

Both modes use get_llm() from conformance/classifier_agent.py, so the only variable is the input.
"""
import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate

from features import HERE, ROOT, RULESET, load, render

sys.path.insert(0, str(ROOT))
from conformance.classifier_agent import classify_modules, get_llm  # noqa: E402

RICH_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert Software Architect analyzing a codebase.
Map each Python module to one of the defined architectural layers below, using its
path, imports, signatures and source as evidence.

Defined layers:
{layers_text}

Rules:
- Only use layer names exactly as listed above, or the string 'unclassified'.
- Never invent new layer names.
- The mapping keys must be the module keys exactly as given."""),
    ("human", "Classify these modules:\n\n{modules_block}"),
])


def keyed(rows):
    """Masking can make two files share a name; suffix collisions so mapping keys stay unique."""
    seen, out = defaultdict(int), []
    for r in rows:
        seen[r["module_masked"]] += 1
        n = seen[r["module_masked"]]
        out.append((r["module_masked"] if n == 1 else f"{r['module_masked']}~{n}", r))
    return out


def batches(rows, level, budget_chars):
    batch, size = [], 0
    for r in rows:
        n = len(render(r, level))
        if batch and size + n > budget_chars:
            yield batch
            batch, size = [], 0
        batch.append(r)
        size += n
    if batch:
        yield batch


def with_retry(fn, tries=8):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            msg = str(e).lower()
            if i == tries - 1 or not any(s in msg for s in ("429", "rate", "timeout", "overloaded", "503")):
                raise
            wait = min(60, 5 * 2 ** i)
            print(f"    retry in {wait}s: {str(e)[:100]}")
            time.sleep(wait)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["prod", "rich"], required=True)
    ap.add_argument("--level", default="L0")
    ap.add_argument("--provider", default="groq")
    ap.add_argument("--budget-chars", type=int, default=12000, help="input chars per LLM call")
    args = ap.parse_args()

    if args.mode == "prod" and args.level not in ("L0", "L1"):
        raise SystemExit("production classify_modules takes names (L0) or names + imports (L1)")
    name = f"{args.provider}-{args.mode}-{args.level}"
    level = args.level
    out = HERE / "preds" / f"{name}.jsonl"
    out.parent.mkdir(exist_ok=True)
    done = {json.loads(line)["id"] for line in out.open(encoding="utf-8")} if out.exists() else set()

    by_repo = defaultdict(list)
    for r in load(eval_only=True):
        if r["id"] not in done:
            by_repo[r["repo"]].append(r)
    print(f"{name}: {sum(map(len, by_repo.values()))} modules to classify ({len(done)} already done)")

    ruleset = json.loads(RULESET.read_text(encoding="utf-8"))
    layers_text = "\n".join(f"- **{l['name']}**: {l['description']}" for l in ruleset["layers"])
    llm = get_llm(args.provider) if args.mode == "rich" else None

    with out.open("a", encoding="utf-8") as fh:
        for repo, rows in by_repo.items():
            # prod L1 sends the whole repo: classify_modules does its own chunking, as it will in production
            for batch in ([rows] if args.mode == "prod" and level == "L1" else batches(rows, level, args.budget_chars)):
                pairs = keyed(batch)
                try:
                    if args.mode == "prod":
                        imports = {k: r["imports"] for k, r in pairs} if level == "L1" else None
                        res = with_retry(lambda: classify_modules([k for k, _ in pairs], str(RULESET), args.provider,
                                                                  module_imports=imports))
                    else:
                        block = "\n\n".join(f"### {k}\n{render(r, level)}" for k, r in pairs)
                        res = with_retry(lambda: (RICH_PROMPT | llm).invoke(
                            {"layers_text": layers_text, "modules_block": block}))
                    mapping, conf = res.mapping, res.confidence_score
                except Exception as e:
                    print(f"  {repo}: failed ({str(e)[:120]}); left for the next run")
                    continue
                for k, r in pairs:
                    fh.write(json.dumps({"id": r["id"], "pred": mapping.get(k, "unclassified"), "conf": conf}) + "\n")
                fh.flush()
            print(f"  {repo}: {len(rows)} done")


if __name__ == "__main__":
    main()
