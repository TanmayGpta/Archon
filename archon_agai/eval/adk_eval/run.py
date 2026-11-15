"""One command: preflight the FreeLLMAPI router -> build evalsets -> `adk eval` per case -> HTML dashboard.

    python -m archon_agai.eval.adk_eval.run                       # every case in both suites
    python -m archon_agai.eval.adk_eval.run --cases audit_archon_this_repo
    python -m archon_agai.eval.adk_eval.run --dashboard-only       # re-render from existing results

Each case runs in its own `adk eval` process, one after another. ADK runs the cases of one call concurrently,
and the stdio MCP toolsets then fail to initialise for some of them (ADK's graceful MCP error handling leaves
the agent with zero tools), which would score harness failures as agent failures.

Results:   archon_agai/eval/adk_eval/archon_audit/.adk/eval_history/*.evalset_result.json
Batches:   archon_agai/eval/adk_eval/archon_audit/.adk/batches/*.json (groups one run's result files + models)
Dashboard: archon_agai/eval/reports/eval_dashboard.html
"""
import argparse
import json
import os
import subprocess
import sys
import time

import httpx

from archon_agai.config import REPO_ROOT
from archon_agai.eval.adk_eval import build_evalset, dashboard, settings


def preflight() -> list[str]:
    settings.require_key()
    try:
        r = httpx.get(f"{settings.EVAL_BASE_URL}/models", timeout=10,
                      headers={"Authorization": f"Bearer {settings.EVAL_LLM_KEY}"})
    except httpx.HTTPError as e:
        raise SystemExit(f"FreeLLMAPI router not reachable at {settings.EVAL_BASE_URL}: {e}")
    if r.status_code != 200:
        raise SystemExit(f"FreeLLMAPI router rejected FREELLMAPI_KEY ({r.status_code}): {r.text[:200]}")
    models = [m.get("id", "") for m in r.json().get("data", [])]
    for name in {settings.EVAL_MODEL, settings.JUDGE_MODEL}:
        bare = name.removeprefix("openai/")
        if bare != "auto" and bare not in models:
            raise SystemExit(f"model '{bare}' is not served by the router; available: {', '.join(models[:20])}")
    return models


def resolve_config(suite: str) -> str:
    """Fill $AGAI_EVAL_JUDGE_MODEL in the suite's config with the configured judge."""
    src = settings.SUITES[suite][1]
    raw = src.read_text(encoding="utf-8").replace("$AGAI_EVAL_JUDGE_MODEL", settings.litellm_id(settings.JUDGE_MODEL))
    out = settings.ADK_DIR / f"resolved_{src.name}"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(raw, encoding="utf-8")
    return str(out)


def _env() -> dict:
    return {**os.environ,
            "PYTHONPATH": os.pathsep.join(filter(None, [str(REPO_ROOT), os.environ.get("PYTHONPATH")])),
            "PYTHONIOENCODING": "utf-8",
            "AGAI_RUNS_DIR": str(settings.ADK_DIR / "runs"),  # keep eval event logs out of the live UI's runs dir
            "OPENAI_API_BASE": settings.EVAL_BASE_URL, "OPENAI_BASE_URL": settings.EVAL_BASE_URL,
            "OPENAI_API_KEY": settings.EVAL_LLM_KEY}


def run_case(evalset: str, case_id: str, config: str) -> int:
    adk = os.path.join(os.path.dirname(sys.executable), "adk.exe" if os.name == "nt" else "adk")
    cmd = [adk, "eval", str(settings.APP_DIR), f"{evalset}:{case_id}", "--config_file_path", config,
           "--print_detailed_results"]
    return subprocess.call(cmd, env=_env(), cwd=str(REPO_ROOT))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cases", nargs="*", default=[], help="eval_ids to run (default: all)")
    ap.add_argument("--dashboard-only", action="store_true", help="only re-render the dashboard")
    args = ap.parse_args()

    if not args.dashboard_only:
        models = preflight()
        print(f"router ok: {settings.EVAL_BASE_URL} ({len(models)} models) | agent model={settings.EVAL_MODEL} "
              f"judge={settings.JUDGE_MODEL}", flush=True)
        paths = build_evalset.main()
        settings.HISTORY_DIR.mkdir(parents=True, exist_ok=True)
        before = set(settings.HISTORY_DIR.glob("*.evalset_result.json"))
        started, exit_codes = time.time(), {}
        for suite, evalset in paths.items():
            config = resolve_config(suite)
            ids = [c["eval_id"] for c in json.loads(evalset.read_text(encoding="utf-8"))["eval_cases"]]
            for cid in ids:
                if args.cases and cid not in args.cases:
                    continue
                t0 = time.perf_counter()
                print(f"\n=== [{suite}] {cid}", flush=True)
                exit_codes[cid] = run_case(str(evalset), cid, config)
                print(f"=== {cid}: exit {exit_codes[cid]} in {time.perf_counter() - t0:.0f}s", flush=True)
        new = sorted(p.name for p in set(settings.HISTORY_DIR.glob("*.evalset_result.json")) - before)
        settings.BATCH_DIR.mkdir(parents=True, exist_ok=True)
        batch = {"started_at": started, "finished_at": time.time(), "agent_model": settings.EVAL_MODEL,
                 "judge_model": settings.JUDGE_MODEL, "base_url": settings.EVAL_BASE_URL,
                 "exit_codes": exit_codes, "result_files": new}
        (settings.BATCH_DIR / f"batch-{int(started)}.json").write_text(json.dumps(batch, indent=2), encoding="utf-8")
        print(f"\n{len(new)} result file(s) recorded for {len(exit_codes)} case(s)")
    print(f"dashboard -> {dashboard.render()}")


if __name__ == "__main__":
    main()
