"""Renders one dataset record as model input at a given richness level.

L0  module path only (what production sends today)
L1  + imported modules
L2  + class/function signatures and first docstring lines
L3  + source (truncated)
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RULESET = ROOT / "shared" / "fixtures" / "clean_architecture.json"
DATASET = HERE / "data" / "dataset.jsonl"
LEVELS = ("L0", "L1", "L2", "L3")


def render(r, level):
    parts = [f"module: {r['module_masked']}"]
    if level >= "L1":
        parts.append("imports: " + (", ".join(r["imports"][:40]) or "(none)"))
    if level >= "L2" and r["skeleton"]:
        parts.append("signatures:\n" + r["skeleton"][:1500])
    if level >= "L3":
        parts.append("source:\n" + r["source"][:4000])
    return "\n".join(parts)


def load(split=None, eval_only=False):
    rows = [json.loads(line) for line in DATASET.open(encoding="utf-8")]
    if split:
        rows = [r for r in rows if r["split"] == split]
    if eval_only:
        rows = [r for r in rows if r["eval"]]
    return rows


def layer_descriptions():
    ruleset = json.loads(RULESET.read_text(encoding="utf-8"))
    return {layer["name"]: layer["description"] for layer in ruleset["layers"]}
