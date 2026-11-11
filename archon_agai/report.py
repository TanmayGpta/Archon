"""Render a session's structured outputs (Pydantic) as the final Markdown report."""
from typing import Any, Dict

from archon_agai.schemas import AuditNarrative, AuditResult, HealingReport


def render_markdown(st: Dict[str, Any]) -> str:
    out = [
        f"# Archon Guard Conformance & Healing Report — `{st.get('session_id')}`", "",
        f"**Target Codebase:** `{st.get('codebase_path')}`  ",
        f"**Active Blueprint:** `{st.get('blueprint_id')}`  ",
        "",
        "---",
        "",
    ]
    if st.get("audit_result"):
        a = AuditResult.model_validate(st["audit_result"])
        out += [
            "## 1. Conformance Audit & Violations (ADK / Conformance Engine)", "",
            f"Health score: **{a.metrics.health_score} / 100** · {a.metrics.total_violations} violations · "
            f"{a.metrics.total_cycles} cycles · {a.metrics.total_edges_checked} edges checked", "",
            "| Violation ID | Layer Boundary | Location (File:Line) | Severity |",
            "|:---|:---|:---|:---|",
        ]
        out += [
            f"| `{v.id}` | {v.source_layer} → {v.target_layer} | `{v.file_path}:{v.line_number}` | **{v.severity.upper()}** |"
            for v in a.violations
        ]
        out += ["", "---", ""]
    if st.get("audit_narrative"):
        n = AuditNarrative.model_validate(st["audit_narrative"])
        out += [
            "## 2. Architectural Analysis & Fix Rationales (ADK ReportAgent)", "",
            f"> {n.summary}", "",
            "### Prescribed Inversion Fixes", "",
        ]
        out += [f"- **`{r.violation_id}`**: {r.why_it_matters}  \n  *Fix:* {r.prescribed_fix}" for r in n.rationales]
        if n.roadmap:
            out += ["", "### Implementation Roadmap", ""] + [f"{i}. {s}" for i, s in enumerate(n.roadmap, 1)]
        out += ["", "---", ""]
    else:
        out += [
            "## 2. Architectural Analysis & Fix Rationales (ADK ReportAgent)", "",
            "> *Status: Deterministic scan completed. LLM architectural narrative was skipped or fell back to deterministic ground truth.*", "",
            "---", "",
        ]

    if st.get("healing_report"):
        h = HealingReport.model_validate(st["healing_report"])
        out += [
            f"## 3. Automated Healing Plan & Verification (CrewAI via A2A Protocol)", "",
            f"Status: **{h.status.upper()}** · Attempts: **{h.attempts}**", "",
        ]
        if h.verification:
            v = h.verification
            out += [
                "### Pre/Post Verification Metrics", "",
                "| Metric | Before Healing | After Healing | Outcome |",
                "|:---|:---|:---|:---|",
                f"| Health Score | {v.health_before} | **{v.health_after}** | {'Improved' if v.health_after > v.health_before else 'Unchanged'} |",
                f"| Active Violations | {v.violations_before} | **{v.violations_after}** | {v.violations_before - v.violations_after} resolved |",
                f"| Conformance Tests | – | {'PASS' if v.tests_passed else 'FAIL'} | {'Healthy' if v.tests_passed else 'Broken'} |",
                "",
            ]
        out += [
            "### Generated Healing Patches", "",
            "| Target File | Operation | Resolves Violation | Rationale |",
            "|:---|:---|:---|:---|",
        ]
        out += [f"| `{p.path}` | `{p.operation.upper()}` | {', '.join(f'`{v}`' for v in p.violation_ids)} | {p.rationale} |" for p in h.patches]
        out += ["", h.summary_markdown, "", "---", ""]
    else:
        out += [
            "## 3. Automated Healing Plan & Verification (CrewAI via A2A Protocol)", "",
            "> *Status: Pending — Click **'2 · Heal (CrewAI)'** in the right panel to trigger the multi-agent CrewAI team and generate verified dependency inversion patches.*", "",
            "---", "",
        ]

    if st.get("applied"):
        applied = st.get("applied", [])
        after = st.get("audit_after_apply")
        remaining_viols = after.get("violations", []) if after else []
        unhealed_files = {v.get("file_path") for v in remaining_viols if v.get("file_path")}
        out += [
            "## 4. Post-Apply Verification Status", "",
            f"Patches applied to active repository: **{len(applied)} files**", "",
            "| File Path | Status | Details |",
            "|:---|:---|:---|",
        ]
        for p in applied:
            if p in unhealed_files:
                count = sum(1 for v in remaining_viols if v.get("file_path") == p)
                out.append(f"| `{p}` | <span style='color:#f87171'>**FAILED TO HEAL**</span> | {count} violation(s) remain |")
            else:
                out.append(f"| `{p}` | <span style='color:#4ade80'>**HEALED**</span> | All layer violations resolved |")
        out += ["", "---", ""]
    else:
        out += [
            "## 4. Post-Apply Verification Status", "",
            "> *Status: Pending — Click **'Apply all patches'** in the Patches tab to write verified patches to disk and re-check repository conformance.*", "",
            "---", "",
        ]

    c, t = st.get("cost", {}), st.get("timings", {})
    if c:
        out += [
            "## 5. Performance & Telemetry", "",
            "| Stage | Execution Time (s) | Input Tokens | Output Tokens | Estimated Cost (USD) |",
            "|:---|:---|:---|:---|:---|",
            f"| Audit (ADK) | {t.get('audit_s', '–')} | {c['adk']['input_tokens']} | {c['adk']['output_tokens']} | ${c['adk']['usd']:.4f} |",
            f"| Heal (CrewAI) | {t.get('heal_s', '–')} | {c['crewai']['input_tokens']} | {c['crewai']['output_tokens']} | ${c['crewai']['usd']:.4f} |",
            f"| **Total Pipeline** | | | | **${c['total_usd']:.4f}** |",
        ]
    return "\n".join(out)
