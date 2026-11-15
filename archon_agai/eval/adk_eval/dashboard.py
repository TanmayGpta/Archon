"""Render the agent evaluation dashboard (static HTML) from real result files only.

Sources:
  * ADK eval history  archon_agai/eval/adk_eval/archon_audit/.adk/eval_history/*.evalset_result.json
  * metric thresholds archon_agai/eval/adk_eval/archon_audit/test_config.json
  * run metadata      archon_agai/eval/adk_eval/archon_audit/.adk/last_run.json (models used)
  * system benchmark  archon_agai/eval/results/eval-*.json (python -m archon_agai.eval.run_eval), if present

    python -m archon_agai.eval.adk_eval.dashboard [--output path]
"""
import argparse
import html
import json
import statistics
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from google.adk.evaluation.eval_case import get_all_tool_calls
from google.adk.evaluation.eval_metrics import EvalStatus
from google.adk.evaluation.eval_result import EvalSetResult

from archon_agai.eval.adk_eval import settings

INFO_METRICS = {"tool_call_count_v1", "inference_call_count_v1", "token_usage_v1", "invocation_duration_v1"}
LABELS = {
    "tool_trajectory_avg_score": "Tool trajectory",
    "rubric_based_final_response_quality_v1": "Report quality (rubrics)",
    "hallucinations_v1": "Groundedness",
    "response_match_score": "Response match (ROUGE)",
    "final_response_match_v2": "Response match (judge)",
    "tool_call_count_v1": "Tool calls",
    "inference_call_count_v1": "LLM calls",
    "token_usage_v1": "Tokens",
    "invocation_duration_v1": "Latency",
}
E = html.escape


# --------------------------------------------------------------------------- loading

def _load_result(f: Path) -> EvalSetResult:
    raw = json.loads(f.read_text(encoding="utf-8"))
    if isinstance(raw, str):  # ADK writes the model as a JSON string inside JSON
        raw = json.loads(raw)
    return EvalSetResult.model_validate(raw)


def load_runs() -> list[tuple[EvalSetResult, dict]]:
    """One entry per `run.py` batch (its per-case result files merged); unbatched result files stand alone."""
    files = {f.name: f for f in settings.HISTORY_DIR.glob("*.evalset_result.json")} if settings.HISTORY_DIR.exists() else {}
    runs, used = [], set()
    for bf in sorted(settings.BATCH_DIR.glob("batch-*.json")) if settings.BATCH_DIR.exists() else []:
        meta = load_json(bf) or {}
        parts = [_load_result(files[n]) for n in meta.get("result_files", []) if n in files]
        used.update(meta.get("result_files", []))
        if not parts:
            continue
        merged = EvalSetResult(eval_set_result_id=bf.stem, eval_set_id="+".join(sorted({x.eval_set_id for x in parts})),
                               eval_case_results=[c for x in parts for c in x.eval_case_results],
                               creation_timestamp=max(x.creation_timestamp for x in parts))
        runs.append((merged, meta))
    for name, f in files.items():
        if name not in used:
            runs.append((_load_result(f), {}))
    return sorted(runs, key=lambda r: r[0].creation_timestamp)


def load_thresholds() -> dict[str, float]:
    out = {}
    for _, cfg in settings.SUITES.values():
        data = load_json(cfg) or {}
        for name, crit in data.get("criteria", {}).items():
            out.setdefault(name, crit if isinstance(crit, (int, float)) else crit.get("threshold"))
    return out


def load_json(p: Path) -> Optional[dict]:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def latest_bench() -> tuple[Optional[Path], Optional[dict]]:
    files = sorted(settings.BENCH_RESULTS_DIR.glob("eval-*.json")) if settings.BENCH_RESULTS_DIR.exists() else []
    return (files[-1], load_json(files[-1])) if files else (None, None)


# --------------------------------------------------------------------------- metrics

def metric_map(case) -> dict[str, Any]:
    return {m.metric_name: m for m in case.overall_eval_metric_results}


def metric_value(m) -> Optional[float]:
    if m is None:
        return None
    if m.metric_name == "token_usage_v1" and m.details and m.details.token_usage_details:
        return m.details.token_usage_details.total_tokens
    return m.score


def case_passed(case) -> bool:
    return case.final_eval_status == EvalStatus.PASSED


def run_summary(run: EvalSetResult) -> dict:
    cases = run.eval_case_results
    names = []
    for c in cases:
        for m in c.overall_eval_metric_results:
            if m.metric_name not in names:
                names.append(m.metric_name)
    per = {}
    for n in names:
        vals = [v for v in (metric_value(metric_map(c).get(n)) for c in cases) if v is not None]
        evaluated = [metric_map(c)[n] for c in cases if n in metric_map(c)
                     and metric_map(c)[n].eval_status in (EvalStatus.PASSED, EvalStatus.FAILED)]
        per[n] = {"mean": statistics.fmean(vals) if vals else None,
                  "passed": sum(m.eval_status == EvalStatus.PASSED for m in evaluated),
                  "evaluated": len(evaluated),
                  "not_evaluated": sum(1 for c in cases if n in metric_map(c)
                                       and metric_map(c)[n].eval_status == EvalStatus.NOT_EVALUATED)}
    passed = sum(case_passed(c) for c in cases)
    return {"cases": len(cases), "passed": passed, "rate": passed / len(cases) if cases else None, "metrics": per}


def fmt(name: str, v: Optional[float]) -> str:
    if v is None:
        return "—"
    if name == "invocation_duration_v1":
        return f"{v:.1f}s"  # ADK reports seconds
    if name in INFO_METRICS:
        return f"{v:,.0f}" if v >= 10 else f"{v:.1f}"
    return f"{v:.2f}"


def text_of(content) -> str:
    if not content or not content.parts:
        return ""
    return "\n".join(p.text for p in content.parts if getattr(p, "text", None) and not getattr(p, "thought", False))


def calls_of(inv) -> list[str]:
    if inv is None or inv.intermediate_data is None:
        return []
    return [f"{c.name}({json.dumps(c.args or {}, ensure_ascii=False)})" for c in get_all_tool_calls(inv.intermediate_data)]


def pretty(text: str) -> str:
    try:
        return json.dumps(json.loads(text), indent=2, ensure_ascii=False)
    except (ValueError, TypeError):
        return text


# --------------------------------------------------------------------------- html pieces

def badge(status: EvalStatus) -> str:
    cls, label = {EvalStatus.PASSED: ("pass", "Pass"), EvalStatus.FAILED: ("fail", "Fail"),
                  EvalStatus.NOT_EVALUATED: ("na", "Not evaluated"),
                  EvalStatus.INFORMATIONAL: ("info", "Info")}.get(status, ("na", str(status)))
    return f'<span class="badge {cls}">{label}</span>'


def score_cell(m, threshold: Optional[float]) -> str:
    if m is None:
        return '<td class="num muted">—</td>'
    v = metric_value(m)
    if m.metric_name in INFO_METRICS:
        return f'<td class="num">{fmt(m.metric_name, v)}</td>'
    cls = {EvalStatus.PASSED: "pass", EvalStatus.FAILED: "fail"}.get(m.eval_status, "na")
    bar = "" if v is None else f'<span class="bar"><i style="width:{max(0, min(1, v)) * 100:.0f}%"></i></span>'
    return f'<td class="num score {cls}" title="threshold {threshold}">{fmt(m.metric_name, v)}{bar}</td>'


def kpis(summary: dict, thresholds: dict) -> str:
    tiles = [("Cases passed", f"{summary['passed']}/{summary['cases']}",
              f"{summary['rate'] * 100:.0f}% pass rate" if summary["rate"] is not None else "")]
    for n, s in summary["metrics"].items():
        if n in INFO_METRICS:
            continue
        sub = f"{s['passed']}/{s['evaluated']} meet ≥ {thresholds.get(n, '?')}"
        if s["not_evaluated"]:
            sub += f" · {s['not_evaluated']} not evaluated"
        tiles.append((LABELS.get(n, n), fmt(n, s["mean"]), sub))
    for n in ("invocation_duration_v1", "token_usage_v1", "inference_call_count_v1", "tool_call_count_v1"):
        if n in summary["metrics"]:
            tiles.append((LABELS[n], fmt(n, summary["metrics"][n]["mean"]), "mean per case"))
    return '<div class="kpis">' + "".join(
        f'<div class="kpi"><div class="k">{E(k)}</div><div class="v">{E(v)}</div><div class="s">{E(s)}</div></div>'
        for k, v, s in tiles) + "</div>"


def trend(runs: list[EvalSetResult]) -> str:
    if len(runs) < 2:
        return '<p class="muted">The trend chart appears after two or more runs.</p>'
    pts = [(r, run_summary(r)) for r in runs[-20:]]
    w, h, pad = 640, 160, 28
    step = (w - 2 * pad) / max(1, len(pts) - 1)
    coords = [(pad + i * step, h - pad - (s["rate"] or 0) * (h - 2 * pad)) for i, (_, s) in enumerate(pts)]
    path = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(coords))
    dots = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4"><title>{E(datetime.fromtimestamp(r.creation_timestamp).strftime("%Y-%m-%d %H:%M"))}'
        f' · {s["passed"]}/{s["cases"]} passed</title></circle>' for (x, y), (r, s) in zip(coords, pts))
    grid = "".join(f'<line x1="{pad}" x2="{w - pad}" y1="{h - pad - g * (h - 2 * pad):.1f}" '
                   f'y2="{h - pad - g * (h - 2 * pad):.1f}"/><text x="4" y="{h - pad - g * (h - 2 * pad) + 4:.1f}">'
                   f'{int(g * 100)}%</text>' for g in (0, .5, 1))
    return (f'<svg class="trend" viewBox="0 0 {w} {h}" role="img" aria-label="Pass rate per run">'
            f'<g class="grid">{grid}</g><path d="{path}"/>{dots}</svg>')


def case_rows(run: EvalSetResult, metrics: list[str], thresholds: dict) -> str:
    rows = []
    for c in run.eval_case_results:
        mm = metric_map(c)
        cells = "".join(score_cell(mm.get(n), thresholds.get(n)) for n in metrics)
        detail = case_detail(c, thresholds)
        warn = ' <span class="badge na" title="MCP tools not loaded">no tools</span>' if tools_missing(c) else ""
        rows.append(f'<tr><td><details><summary><code>{E(c.eval_id)}</code>{warn}</summary>{detail}</details></td>'
                    f'<td>{badge(c.final_eval_status)}</td>{cells}</tr>')
    return "".join(rows)


def tools_missing(c) -> bool:
    """Expected a tool call but no agent had any tool declared: the MCP toolset never loaded (harness failure)."""
    for pi in c.eval_metric_result_per_invocation:
        act, exp = pi.actual_invocation, pi.expected_invocation
        details = act.app_details.agent_details if act.app_details else {}
        if calls_of(exp) and details and not any(d.tool_declarations for d in details.values()):
            return True
    return False


def case_detail(c, thresholds: dict) -> str:
    parts = []
    if tools_missing(c):
        parts.append('<p class="warn">No tools were loaded for any agent in this case (MCP toolset failed to '
                     'initialise). Treat the scores as a harness failure, not an agent decision.</p>')
    for pi in c.eval_metric_result_per_invocation:
        act, exp = pi.actual_invocation, pi.expected_invocation
        parts.append(f'<div class="kv"><b>Prompt</b><pre>{E(text_of(act.user_content))}</pre></div>')
        ec, ac = calls_of(exp), calls_of(act)
        parts.append('<div class="cols"><div><b>Expected tool calls</b><pre>' + E("\n".join(ec) or "(none)") +
                     '</pre></div><div><b>Actual tool calls</b><pre>' + E("\n".join(ac) or "(none)") + "</pre></div></div>")
        parts.append(f'<div class="kv"><b>Final response</b><pre class="resp">{E(pretty(text_of(act.final_response)) or "(empty)")}</pre></div>')
        rubric_items = []
        for m in pi.eval_metric_results:
            if m.details and m.details.rubric_scores:
                texts = {r.rubric_id: r.rubric_content.text_property for r in (act.rubrics or [])}
                for rs in m.details.rubric_scores:
                    ok = "pass" if (rs.score or 0) >= 1 else "fail"
                    rubric_items.append(f'<li class="{ok}"><b>{E(rs.rubric_id)}</b> · score {E(str(rs.score))}'
                                        f'<div>{E(texts.get(rs.rubric_id, ""))}</div>'
                                        f'<div class="muted">{E(rs.rationale or "")}</div></li>')
        if rubric_items:
            parts.append('<div class="kv"><b>Rubric verdicts (judge)</b><ul class="rubrics">' + "".join(rubric_items) + "</ul></div>")
        errs = [m for m in pi.eval_metric_results if m.eval_status == EvalStatus.NOT_EVALUATED]
        if errs:
            parts.append('<p class="muted">Not evaluated: ' + E(", ".join(m.metric_name for m in errs)) + "</p>")
    return '<div class="detail">' + "".join(parts) + "</div>"


def spread(vals: list[float]) -> tuple[Optional[float], Optional[float], Optional[float]]:
    vals = [v for v in vals if v is not None]
    return (statistics.median(vals), min(vals), max(vals)) if vals else (None, None, None)


def _ts(v) -> float:
    return v if isinstance(v, (int, float)) else datetime.fromisoformat(str(v)).timestamp()


def _log_latencies(run: EvalSetResult, meta: dict) -> dict[str, dict[str, list[float]]]:
    """Per-agent model/tool latencies from the eval sessions' event logs (callbacks.emit), limited to this run's
    time window. Returns {agent: {"model": [s, ...], "tool": [s, ...]}}."""
    out: dict[str, dict[str, list[float]]] = {}
    runs_dir = settings.ADK_DIR / "runs"
    lo, hi = meta.get("started_at"), meta.get("finished_at")
    if not runs_dir.exists() or lo is None or hi is None:
        return out
    for c in run.eval_case_results:
        f = runs_dir / f"eval-{c.eval_id}.events.jsonl"
        if not f.exists():
            continue
        open_: dict[tuple[str, str], float] = {}
        for line in f.read_text(encoding="utf-8").splitlines():
            try:
                e = json.loads(line)
                t = _ts(e["ts"])
            except (ValueError, KeyError):
                continue
            if not lo <= t <= hi:
                continue
            agent, kind = e.get("agent") or "?", e.get("kind")
            for start, end, bucket in (("model_start", "model_end", "model"), ("tool_start", "tool_end", "tool")):
                if kind == start:
                    open_[(agent, bucket)] = t
                elif kind == end and (agent, bucket) in open_:
                    out.setdefault(agent, {"model": [], "tool": []})[bucket].append(t - open_.pop((agent, bucket)))
    return out


def agent_rows(run: EvalSetResult, meta: dict) -> str:
    stats: dict[str, dict] = {}
    for c in run.eval_case_results:
        per_case: dict[str, dict] = {}
        for pi in c.eval_metric_result_per_invocation:
            for e in getattr(pi.actual_invocation.intermediate_data, "invocation_events", None) or []:
                s = per_case.setdefault(e.author, {"calls": 0, "tools": 0, "in": 0, "out": 0, "models": set()})
                s["tools"] += sum(1 for p in (e.content.parts if e.content else []) if p.function_call)
                if e.usage_metadata:
                    s["calls"] += 1
                    s["in"] += e.usage_metadata.prompt_token_count or 0
                    s["out"] += e.usage_metadata.candidates_token_count or 0
                if e.model_version:
                    s["models"].add(e.model_version.removeprefix("openai/"))
        for agent, s in per_case.items():
            a = stats.setdefault(agent, {"cases": 0, "calls": 0, "tools": 0, "in": [], "out": [], "models": set()})
            a["cases"] += 1
            a["calls"] += s["calls"]
            a["tools"] += s["tools"]
            a["in"].append(s["in"])
            a["out"].append(s["out"])
            a["models"] |= s["models"]
    if not stats:
        return ""
    lat = _log_latencies(run, meta)

    def trio(vals: list[float], unit: str = "s") -> str:
        med, lo, hi = spread(vals)
        if med is None:
            return '<td class="num muted" colspan="3">—</td>'
        f = (lambda v: f"{v:.1f}s") if unit == "s" else (lambda v: f"{v:,.0f}")
        return f'<td class="num">{f(med)}</td><td class="num">{f(lo)}</td><td class="num">{f(hi)}</td>'

    rows = []
    for agent, a in stats.items():
        if not a["calls"] and not a["tools"]:
            continue  # e.g. the pipeline itself when the input guardrail answers without any model call
        rows.append(f"<tr><th>{E(agent)}</th><td class=\"num\">{a['cases']}</td><td class=\"num\">{a['calls']}</td>"
                    f"<td class=\"num\">{a['tools']}</td>{trio(lat.get(agent, {}).get('model', []))}"
                    f"<td class=\"num\">{fmt('token_usage_v1', statistics.fmean(a['in']))}</td>"
                    f"<td class=\"num\">{fmt('token_usage_v1', statistics.fmean(a['out']))}</td>"
                    f"<td><code>{E(', '.join(sorted(a['models'])) or '—')}</code></td></tr>")
    head = ("<tr><th rowspan=2>Agent</th><th class=num rowspan=2>Cases</th><th class=num rowspan=2>Model calls</th>"
            "<th class=num rowspan=2>Tool calls</th><th class=num colspan=3>Latency per model call</th>"
            "<th class=num rowspan=2>Mean prompt tokens / case</th><th class=num rowspan=2>Mean output tokens / case</th>"
            "<th rowspan=2>Models the router used</th></tr><tr><th class=num>Median</th><th class=num>Fastest</th>"
            "<th class=num>Slowest</th></tr>")
    note = "" if lat else ('<p class="muted">Per-call latency needs the run\'s event logs '
                           '(<code>.adk/runs</code>) and batch time window; not available for this run.</p>')
    return f'<div class="scroll"><table><thead>{head}</thead><tbody>{"".join(rows)}</tbody></table></div>{note}'


def spread_rows(summary_run: EvalSetResult) -> str:
    rows = []
    for n in ("invocation_duration_v1", "token_usage_v1", "inference_call_count_v1", "tool_call_count_v1"):
        vals = [metric_value(metric_map(c).get(n)) for c in summary_run.eval_case_results]
        # a guardrail-blocked case never reaches a model; leave it out of cost/latency spread
        vals = [v for v, c in zip(vals, summary_run.eval_case_results) if v is not None
                and (metric_value(metric_map(c).get("inference_call_count_v1")) or 0) > 0]
        med, lo, hi = spread(vals)
        if med is None:
            continue
        rows.append(f"<tr><th>{E(LABELS[n])}</th><td class=num>{len(vals)}</td><td class=num>{fmt(n, med)}</td>"
                    f"<td class=num>{fmt(n, lo)}</td><td class=num>{fmt(n, hi)}</td></tr>")
    if not rows:
        return ""
    return ('<div class="scroll"><table><thead><tr><th>Per case</th><th class=num>Cases</th><th class=num>Median</th>'
            '<th class=num>Fastest / lowest</th><th class=num>Slowest / highest</th></tr></thead><tbody>'
            + "".join(rows) + "</tbody></table></div>"
            '<p class="muted">Cases blocked by the input guardrail make no model call and are excluded here.</p>')


def threats(runs: list[tuple[EvalSetResult, dict]]) -> str:
    """Limits of this evaluation. Design limits are always listed; data-driven ones only when they apply."""
    latest, meta = runs[-1]
    items = [
        "Expected answers are derived from Archon's own deterministic scanner, the same engine the agent calls through "
        "MCP. The eval therefore measures whether the agents call the tool correctly and report its result faithfully, "
        "not whether the scanner's verdicts are architecturally right.",
        "Report quality and groundedness are scored by an LLM judge. Judges are noisy, and a judge reached through the "
        "same router as the agent may share its blind spots.",
        "The redirect case is scored on what the model attempted. In production the before_tool guardrail rewrites the "
        "path to the session codebase, so a failed trajectory there is an attempted, not an executed, escape.",
        "The injection prompt is matched by the guardrail's regex list. Passing it shows the guardrail works for known "
        "phrasings, not that it catches novel ones.",
        "Only the ADK audit pipeline is scored here. The CrewAI healing crew is covered by the system benchmark "
        "(run_eval) below, which needs the gateway and healing servers running.",
    ]
    ids = {c.eval_id for c in latest.eval_case_results}
    audits = [i for i in ids if i.startswith("audit_")]
    items.append(f"The latest run covers {len(ids)} case(s), of which {len(audits)} are plain audits of distinct "
                 "codebases. That is too few to generalise to arbitrary repositories.")
    per_case = {}
    for r, _ in runs:
        for c in r.eval_case_results:
            per_case[c.eval_id] = per_case.get(c.eval_id, 0) + 1
    if per_case and min(per_case.values()) < 3:
        items.append(f"Each case has been run at most {max(per_case.values())} time(s). With a stochastic model a "
                     "single run is an anecdote; repeat runs are needed to report variance.")
    models = set()
    for c in latest.eval_case_results:
        for pi in c.eval_metric_result_per_invocation:
            for e in getattr(pi.actual_invocation.intermediate_data, "invocation_events", None) or []:
                if e.model_version:
                    models.add(e.model_version.removeprefix("openai/"))
    if "auto" in {str(meta.get("agent_model")), str(meta.get("judge_model"))}:
        items.append("The router was set to 'auto', so it picks a provider per call"
                     + (f" (this run used: {', '.join(sorted(models))})" if models else "")
                     + ". Scores can change between runs for reasons unrelated to the agent; pin AGAI_EVAL_MODEL and "
                     "AGAI_EVAL_JUDGE_MODEL for comparable runs.")
    na = sum(1 for c in latest.eval_case_results for m in c.overall_eval_metric_results
             if m.eval_status == EvalStatus.NOT_EVALUATED)
    if na:
        items.append(f"{na} metric result(s) in the latest run were not evaluated, usually because the judge's reply "
                     "did not follow ADK's expected format. They are shown as such, not counted as passes or fails.")
    return "<ul class=\"threats\">" + "".join(f"<li>{E(t)}</li>" for t in items) + "</ul>"


def history_rows(runs: list[tuple[EvalSetResult, dict]]) -> str:
    out = []
    for r, meta in reversed(runs):
        s = run_summary(r)
        t = datetime.fromtimestamp(r.creation_timestamp).strftime("%Y-%m-%d %H:%M:%S")
        out.append(f"<tr><td>{E(t)}</td><td><code>{E(r.eval_set_result_id)}</code></td>"
                   f"<td><code>{E(str(meta.get('agent_model', '-')))}</code></td>"
                   f"<td><code>{E(str(meta.get('judge_model', '-')))}</code></td>"
                   f'<td class="num">{s["passed"]}/{s["cases"]}</td>'
                   f'<td class="num">{(s["rate"] or 0) * 100:.0f}%</td></tr>')
    return "".join(out)


def bench_section() -> str:
    path, data = latest_bench()
    if not data:
        return ('<p class="muted">No system benchmark results yet. Run <code>python -m archon_agai.eval.run_eval '
                '--api http://127.0.0.1:8100 --variants 5</code> with the gateway (8100) and healing server (8101) '
                'running; results then appear here.</p>')
    summ = data.get("summary", {})
    tiles = "".join(f'<div class="kpi"><div class="k">{E(k.replace("_", " "))}</div>'
                    f'<div class="v">{E(f"{v:.3g}" if isinstance(v, float) else str(v))}</div></div>'
                    for k, v in summ.items() if v is not None)
    rows = data.get("rows", [])
    cols = list(dict.fromkeys(k for r in rows for k in r))
    table = ("<table><thead><tr>" + "".join(f"<th>{E(c)}</th>" for c in cols) + "</tr></thead><tbody>" +
             "".join("<tr>" + "".join(f"<td>{E(str(r.get(c, '')))}</td>" for c in cols) + "</tr>" for r in rows) +
             "</tbody></table>") if rows else ""
    return f'<p class="muted">Source: <code>{E(path.name)}</code></p><div class="kpis">{tiles}</div><div class="scroll">{table}</div>'


CSS = """
:root{--bg:#f7f7f5;--card:#fff;--fg:#1c1c1a;--muted:#6b6b66;--line:#e4e3de;--pass:#1f7a4d;--pass-bg:#e3f3ea;
--fail:#b4322a;--fail-bg:#fbe7e5;--na:#7a6a1f;--na-bg:#f6f0d8;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#151514;--card:#1f1f1d;--fg:#ecebe6;
--muted:#9b9a93;--line:#33332f;--pass:#6fd3a0;--pass-bg:#173326;--fail:#f08a80;--fail-bg:#3a1e1b;--na:#e3cf7a;
--na-bg:#332d14;--accent:#8ea6ff}}
:root[data-theme="dark"]{--bg:#151514;--card:#1f1f1d;--fg:#ecebe6;--muted:#9b9a93;--line:#33332f;--pass:#6fd3a0;
--pass-bg:#173326;--fail:#f08a80;--fail-bg:#3a1e1b;--na:#e3cf7a;--na-bg:#332d14;--accent:#8ea6ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}
h2{font-size:16px;margin:32px 0 12px}.muted{color:var(--muted)}code{font:12px/1.4 ui-monospace,Consolas,monospace}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--muted);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi .k{color:var(--muted);font-size:12px;text-transform:capitalize}.kpi .v{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums}
.kpi .s{color:var(--muted);font-size:12px}.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.score.pass{color:var(--pass)}.score.fail{color:var(--fail)}.score.na{color:var(--na)}
.bar{display:block;height:3px;background:var(--line);border-radius:2px;margin-top:4px;min-width:48px}
.bar i{display:block;height:100%;background:currentColor;border-radius:2px}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600}
.badge.pass{background:var(--pass-bg);color:var(--pass)}.badge.fail{background:var(--fail-bg);color:var(--fail)}
.badge.na,.badge.info{background:var(--na-bg);color:var(--na)}
details summary{cursor:pointer}.detail{margin-top:10px;max-width:760px}
pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--line);border-radius:6px;
padding:8px;margin:4px 0 10px;font:12px/1.45 ui-monospace,Consolas,monospace}pre.resp{max-height:320px;overflow:auto}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media (max-width:640px){.cols{grid-template-columns:1fr}}
ul.rubrics{list-style:none;padding:0;margin:4px 0}ul.rubrics li{border-left:3px solid var(--line);padding:4px 10px;margin:6px 0}
ul.rubrics li.pass{border-color:var(--pass)}ul.rubrics li.fail{border-color:var(--fail)}
svg.trend{width:100%;max-width:640px;height:auto}svg.trend path{fill:none;stroke:var(--accent);stroke-width:2}
svg.trend circle{fill:var(--accent)}svg.trend .grid line{stroke:var(--line)}svg.trend .grid text{fill:var(--muted);font-size:10px}
.empty{padding:24px;text-align:center}
ul.threats{margin:0;padding-left:20px}ul.threats li{margin:6px 0}
.warn{background:var(--na-bg);color:var(--na);border-radius:6px;padding:8px 10px}.warn-inline{color:var(--na)}
"""


def render(output: Optional[Path] = None) -> Path:
    output = Path(output or settings.REPORT_PATH)
    output.parent.mkdir(parents=True, exist_ok=True)
    runs, thresholds = load_runs(), load_thresholds()
    meta = runs[-1][1] if runs else {}
    generated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if runs:
        latest = runs[-1][0]
        summary = run_summary(latest)
        metrics = [n for n in summary["metrics"] if n not in INFO_METRICS] + \
                  [n for n in ("invocation_duration_v1", "token_usage_v1", "inference_call_count_v1",
                               "tool_call_count_v1") if n in summary["metrics"]]
        head = "".join(f'<th class="num" title="{E(n)}">{E(LABELS.get(n, n))}'
                       f'{"" if n in INFO_METRICS else " ≥ " + E(str(thresholds.get(n, "?")))}</th>' for n in metrics)
        bad = [k for k, v in (meta.get("exit_codes") or {}).items() if v]
        failed_note = (f'<span class="warn-inline">adk eval exited non-zero for: {E(", ".join(bad))}</span>'
                       if bad else "")
        ran = datetime.fromtimestamp(latest.creation_timestamp).strftime("%Y-%m-%d %H:%M:%S")
        adk_html = f"""
<div class="meta"><span>Latest run <b>{E(ran)}</b></span><span>Result <code>{E(latest.eval_set_result_id)}</code></span>
<span>{len(runs)} run(s) on record</span>{failed_note}</div>
<h2>Latest run</h2>{kpis(summary, thresholds)}
<h2>Eval cases</h2><div class="scroll"><table><thead><tr><th>Case</th><th>Status</th>{head}</tr></thead>
<tbody>{case_rows(latest, metrics, thresholds)}</tbody></table></div>
<h2>Per-agent cost and latency</h2>
<p class="muted">Model calls, tokens, tool calls and the model behind each call come from ADK's recorded invocation
events. Latency comes from the agents' own callback event log for this run.</p>{agent_rows(latest, meta)}
<h2>Cost and latency spread</h2>{spread_rows(latest)}
<h2>Known threats to validity</h2><div class="card">{threats(runs)}</div>
<h2>Pass rate over runs</h2><div class="card">{trend([r for r, _ in runs])}</div>
<h2>Run history</h2><div class="scroll"><table><thead><tr><th>Finished</th><th>Run</th><th>Agent model</th><th>Judge model</th><th class="num">Passed</th>
<th class="num">Pass rate</th></tr></thead><tbody>{history_rows(runs)}</tbody></table></div>"""
    else:
        adk_html = ('<div class="card empty">No ADK eval results yet. Run <code>python -m archon_agai.eval.adk_eval.run'
                    '</code> (needs the FreeLLMAPI router and FREELLMAPI_KEY).</div>')

    models = ""
    if meta:
        models = (f'<span>Agent model <code>{E(str(meta.get("agent_model")))}</code></span>'
                  f'<span>Judge model <code>{E(str(meta.get("judge_model")))}</code></span>'
                  f'<span>Router <code>{E(str(meta.get("base_url")))}</code></span>')
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Archon Agent Evals</title>
<style>{CSS}</style></head><body><main>
<h1>Archon agent evaluation</h1>
<div class="meta"><span>ADK app <code>{E(settings.APP_NAME)}</code> (ArchonAuditPipeline: AuditAgent → ReportAgent)</span>{models}
<span>Generated {E(generated)}</span></div>
{adk_html}
<h2>System benchmark: detection, healing, guardrails</h2>{bench_section()}
<h2>How to read this</h2><div class="card muted">
<p><b>Tool trajectory</b>: the agent's tool calls compared with the expected <code>scan_conformance</code> call
(EXACT match, so 1.0 means identical name and arguments). The guardrail suite checks that an injection prompt is
blocked before any model call: no tool calls, and a reply matching the production guardrail's message (ROUGE). <b>Report quality</b>: an LLM judge scores the final report
against rubrics generated from the deterministic scan (health score, violation ids, cycles, fixes).
<b>Groundedness</b>: the share of report sentences supported by the tool output and context
(ADK <code>hallucinations_v1</code>). Latency, tokens and call counts are informational ADK efficiency metrics.</p>
<p>Every number on this page is read from result files written by <code>adk eval</code> and
<code>run_eval</code>. Re-render with <code>python -m archon_agai.eval.adk_eval.run --dashboard-only</code>.</p></div>
</main></body></html>"""
    output.write_text(doc, encoding="utf-8")
    return output


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=None)
    print(render(ap.parse_args().output))
