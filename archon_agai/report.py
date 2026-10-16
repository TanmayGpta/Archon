"""Render a session's structured outputs (Pydantic) as the final Markdown report."""
from typing import Any, Dict

from archon_agai.schemas import AuditNarrative, AuditResult, HealingReport


def render_markdown(st: Dict[str, Any]) -> str:
    out = [f"# Archon Guard Report — `{st.get('session_id')}`", "",
           f"**Codebase:** `{st.get('codebase_path')}`  ", f"**Blueprint:** `{st.get('blueprint_id')}`", ""]
    if st.get("audit_result"):
        a = AuditResult.model_validate(st["audit_result"])
        out += ["## Audit (deterministic)", "",
                f"Health score **{a.metrics.health_score}** · {a.metrics.total_violations} violations · "
                f"{a.metrics.total_cycles} cycles · {a.metrics.total_edges_checked} edges", "",
                "| Violation | Layers | File:line | Severity |", "|---|---|---|---|"]
        out += [f"| `{v.id}` | {v.source_layer} → {v.target_layer} | `{v.file_path}:{v.line_number}` | {v.severity} |"
                for v in a.violations]
        out.append("")
    if st.get("audit_narrative"):
        n = AuditNarrative.model_validate(st["audit_narrative"])
        out += ["## Explanation (ADK ReportAgent)", "", n.summary, ""]
        out += [f"- **`{r.violation_id}`**: {r.why_it_matters} *Fix:* {r.prescribed_fix}" for r in n.rationales]
        if n.roadmap:
            out += ["", "**Roadmap**", ""] + [f"{i}. {s}" for i, s in enumerate(n.roadmap, 1)]
        out.append("")
    if st.get("healing_report"):
        h = HealingReport.model_validate(st["healing_report"])
        out += [f"## Healing (CrewAI via A2A) — {h.status}, {h.attempts} attempt(s)", ""]
        if h.verification:
            v = h.verification
            out += ["| Metric | Before | After |", "|---|---|---|",
                    f"| Health score | {v.health_before} | {v.health_after} |",
                    f"| Violations | {v.violations_before} | {v.violations_after} |",
                    f"| Tests | – | {'pass' if v.tests_passed else 'fail'} |", ""]
        out += ["| Patch | Op | Resolves | Rationale |", "|---|---|---|---|"]
        out += [f"| `{p.path}` | {p.operation} | {', '.join(p.violation_ids)} | {p.rationale} |" for p in h.patches]
        out += ["", h.summary_markdown, ""]
    c, t = st.get("cost", {}), st.get("timings", {})
    if c:
        out += ["## Performance & cost", "", "| Stage | Time (s) | Input tok | Output tok | USD |", "|---|---|---|---|---|",
                f"| Audit (ADK) | {t.get('audit_s', '–')} | {c['adk']['input_tokens']} | {c['adk']['output_tokens']} | {c['adk']['usd']} |",
                f"| Heal (CrewAI) | {t.get('heal_s', '–')} | {c['crewai']['input_tokens']} | {c['crewai']['output_tokens']} | {c['crewai']['usd']} |",
                f"| **Total** | | | | **{c['total_usd']}** |"]
    return "\n".join(out)
