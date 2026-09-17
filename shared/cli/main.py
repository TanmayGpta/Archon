import os
import sys
import json
import fnmatch
from typing import Dict, List, Any, Optional
import click
from dotenv import load_dotenv

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

load_dotenv()

from conformance.extraction import extract_project_dependencies
from conformance.graph import build_dependency_graph
from conformance.checker import check_architecture, ConformanceReport
from conformance.classifier_agent import classify_modules
from shared.schema import ArchitectureRuleset


def resolve_layer_mapping(
    modules: List[str], 
    ruleset: Dict[str, Any], 
    ruleset_path: str,
    provider: Optional[str] = None
) -> Dict[str, str]:
    """
    Resolves physical module paths to architectural layers using a 3-tier cascade:
    1. Explicit glob match_patterns from the ruleset JSON.
    2. Package/directory semantic naming conventions.
    3. LLM semantic classification for ambiguous/remaining modules (if provider configured).
    """
    mapping = {}
    unresolved = []
    layers = ruleset.get("layers", [])

    for mod in modules:
        assigned = None

        # 1. Match against explicit glob patterns
        for layer in layers:
            patterns = layer.get("match_patterns") or []
            for pat in patterns:
                # Support matching against full path, module dot-notation, or base file name
                if (
                    fnmatch.fnmatch(mod, pat)
                    or fnmatch.fnmatch(f"*{mod}*", pat)
                    or fnmatch.fnmatch(mod.split(".")[-1], pat)
                ):
                    assigned = layer["name"]
                    break
            if assigned:
                break

        # 2. Package/directory naming heuristic (case-insensitive)
        if not assigned:
            mod_parts = [p.lower() for p in mod.split(".")]
            for layer in layers:
                lname = layer["name"].lower()
                if lname in mod_parts:
                    assigned = layer["name"]
                    break

        if assigned:
            mapping[mod] = assigned
        else:
            unresolved.append(mod)

    # 3. LLM classification for unresolved modules
    if unresolved and provider and provider != "none":
        click.echo(f"🤖 Invoking AI Classifier ({provider}) for {len(unresolved)} ambiguous module(s)...")
        try:
            ai_result = classify_modules(
                modules=unresolved,
                ruleset_path=ruleset_path,
                model_choice=provider
            )
            mapping.update(ai_result.mapping)
        except Exception as e:
            click.secho(f"⚠️  AI classification warning: {e}. Defaulting unresolved to 'unclassified'.", fg="yellow")
            for m in unresolved:
                if m not in mapping:
                    mapping[m] = "unclassified"
    else:
        for m in unresolved:
            mapping[m] = "unclassified"

    return mapping


def detect_default_provider() -> str:
    """Detects available LLM provider based on environment variables."""
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    if os.getenv("GOOGLE_API_KEY"):
        return "gemini"
    if os.getenv("NVIDIA_API_KEY"):
        return "nvidia"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "none"


def export_report(report: ConformanceReport, ruleset: Dict[str, Any], target_dir: str, out_path: str):
    """Exports the audit report to JSON, HTML, or Markdown."""
    ext = os.path.splitext(out_path)[1].lower()

    if ext == ".json":
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(report.model_dump_json(indent=2))
        click.secho(f"📄 Saved JSON audit report to: {out_path}", fg="cyan")

    elif ext in [".html", ".htm"]:
        violations_html = ""
        for idx, v in enumerate(report.violations, 1):
            line_str = f"Line {v.line_number}: " if v.line_number else ""
            snippet_str = f"<pre style='background:#1e1e1e;color:#f8f8f2;padding:8px;border-radius:4px;'>{line_str}{v.code_snippet or ''}</pre>" if v.code_snippet else ""
            violations_html += f"""
            <div style="border:1px solid #ff4757; background:rgba(255,71,87,0.05); border-radius:8px; padding:14px; margin-bottom:12px;">
                <h4 style="margin:0 0 6px 0; color:#ff4757;">Violation #{idx}: {v.source_module} ({v.source_layer}) &rarr; {v.target_module} ({v.target_layer})</h4>
                {snippet_str}
                <p><b>Hazard:</b> {v.explanation or v.reason}</p>
                <p style="color:#2ecc71;"><b>Remediation:</b> {v.remediation or 'Refactor to decouple dependencies.'}</p>
            </div>
            """
        if not violations_html:
            violations_html = "<p style='color:#2ecc71;'><b>✓ No architectural violations found!</b></p>"

        score_color = "#2ecc71" if report.score >= 80 else ("#f39c12" if report.score >= 50 else "#ff4757")

        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Archon Conformance Report - {ruleset.get('project_name', 'Audit')}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e2e8f0; margin: 0; padding: 30px; }}
        .container {{ max-width: 900px; margin: 0 auto; background: #181b24; border-radius: 12px; padding: 28px; border: 1px solid #2f3542; }}
        .header {{ border-bottom: 1px solid #2f3542; padding-bottom: 16px; margin-bottom: 20px; }}
        .score {{ font-size: 36px; font-weight: bold; color: {score_color}; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>🏛️ Archon Architecture Conformance Audit</h2>
            <p>Target: <code>{target_dir}</code> | Blueprint: <b>{ruleset.get('project_name', 'Custom')}</b></p>
            <div class="score">{report.score:.1f}% Health Score</div>
            <p>Dependencies Checked: <b>{report.total_edges_checked}</b> | Violations: <b>{len(report.violations)}</b></p>
        </div>
        <h3>Architectural Violations</h3>
        {violations_html}
    </div>
</body>
</html>"""
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        click.secho(f"📄 Saved HTML audit report to: {out_path}", fg="cyan")

    elif ext in [".md", ".markdown"]:
        status_icon = "🟢" if report.score >= 80 else ("🟡" if report.score >= 50 else "🔴")
        status_text = "PASSED" if len(report.violations) == 0 else "DRIFT DETECTED"
        status_alert = "> [!TIP]\n> **Architectural Governance Passed:** All scanned modules conform strictly to the declared layers." if len(report.violations) == 0 else f"> [!CAUTION]\n> **Architectural Drift Detected:** Found **{len(report.violations)} forbidden inter-layer dependencies** that violate the blueprint rules."

        md_content = f"# 🏛️ Archon Architecture Conformance Audit\n\n"
        md_content += f"{status_alert}\n\n"
        md_content += f"### 📊 Key Performance Indicators\n\n"
        md_content += f"| Metric | Audit Value | Baseline Target | Status |\n"
        md_content += f"| :--- | :--- | :--- | :--- |\n"
        md_content += f"| **Architecture Health Score** | **`{report.score:.1f}%`** | `100.0%` | {status_icon} **{status_text}** |\n"
        md_content += f"| **Target Codebase** | `{os.path.basename(os.path.abspath(target_dir))}` | - | 📁 Scanned |\n"
        md_content += f"| **Enforced Blueprint** | `{ruleset.get('project_name', 'Custom')}` | - | 📋 Verified |\n"
        md_content += f"| **Internal Dependencies** | `{report.total_edges_checked} imports` | - | 🔗 Mapped |\n"
        md_content += f"| **Violations Flagged** | `{len(report.violations)} issues` | `0` | {'🛡️ Clean' if len(report.violations) == 0 else '⚠️ Needs Fix'} |\n\n"

        if not report.violations:
            md_content += "### 🛡️ Architectural Health Summary\n\n"
            md_content += "✨ **Zero architectural violations detected.** The codebase maintains clean separation of concerns and respects all inward dependency boundaries.\n"
        else:
            md_content += "### ⚠️ Flagged Architectural Violations\n\n"
            md_content += "| # | Offending Source | Forbidden Target | Layer Violation | Line |\n"
            md_content += "| :-: | :--- | :--- | :--- | :-: |\n"
            for idx, v in enumerate(report.violations, 1):
                line_str = f"L{v.line_number}" if v.line_number else "-"
                md_content += f"| **{idx}** | `{v.source_module}` | `{v.target_module}` | **{v.source_layer}** ➔ **{v.target_layer}** | `{line_str}` |\n"
            md_content += "\n---\n\n"

            md_content += "### 🔍 Deep Inspection & Remediation\n\n"
            for idx, v in enumerate(report.violations, 1):
                line_info = f" (Line {v.line_number})" if v.line_number else ""
                md_content += f"<details open>\n"
                md_content += f"<summary><b>Violation #{idx}: {v.source_module} ({v.source_layer}) ➔ {v.target_module} ({v.target_layer})</b></summary>\n\n"
                if v.line_number and v.code_snippet:
                    md_content += f"**Offending Code** `{line_info}`:\n```python\n{v.code_snippet}\n```\n\n"
                md_content += f"**🧠 Architectural Hazard (XAI):**\n> {v.explanation or v.reason}\n\n"
                md_content += f"**💡 Recommended Remediation:**\n> {v.remediation or 'Invert or decouple this dependency.'}\n\n"
                md_content += f"</details>\n\n"

        with open(out_path, "w", encoding="utf-8") as f:
            f.write(md_content)
        click.secho(f"📄 Saved Markdown audit report to: {out_path}", fg="cyan")

    elif ext == ".pdf":
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib import colors
            import datetime

            doc = SimpleDocTemplate(out_path, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
            story = []
            styles = getSampleStyleSheet()

            brand_blue = colors.HexColor("#1e3a8a")
            brand_dark = colors.HexColor("#0f172a")
            color_pass = colors.HexColor("#16a34a")
            color_warn = colors.HexColor("#ea580c")
            color_fail = colors.HexColor("#dc2626")

            score_status = "PASSED" if len(report.violations) == 0 else "DRIFT DETECTED"

            title_style = ParagraphStyle('DocTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=20, leading=24, textColor=brand_blue)
            subtitle_style = ParagraphStyle('DocSub', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=colors.HexColor("#64748b"))
            h2_style = ParagraphStyle('SectionH2', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=brand_dark, spaceBefore=10, spaceAfter=6)
            body_style = ParagraphStyle('Body', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=12, textColor=brand_dark)
            code_style = ParagraphStyle('CodeBlock', parent=styles['Normal'], fontName='Courier-Bold', fontSize=8, leading=11, textColor=colors.HexColor("#b91c1c"))

            # Header
            story.append(Paragraph("🏛️ Archon Architectural Conformance Certificate", title_style))
            story.append(Paragraph(f"Generated on {datetime.datetime.now().strftime('%B %d, %Y - %H:%M:%S')} | Target: <b>{os.path.basename(os.path.abspath(target_dir))}</b>", subtitle_style))
            story.append(Spacer(1, 6))
            story.append(HRFlowable(width="100%", thickness=1.5, color=brand_blue, spaceBefore=4, spaceAfter=10))

            # KPI Table
            kpi_data = [
                [Paragraph("<b>Metric</b>", body_style), Paragraph("<b>Audit Result</b>", body_style), Paragraph("<b>Target</b>", body_style), Paragraph("<b>Status</b>", body_style)],
                [Paragraph("<b>Architecture Health Score</b>", body_style), Paragraph(f"<b>{report.score:.1f}%</b>", body_style), "100.0%", Paragraph(f"<b>{score_status}</b>", body_style)],
                [Paragraph("<b>Enforced Blueprint</b>", body_style), str(ruleset.get("project_name", "Custom")), "-", "Verified"],
                [Paragraph("<b>Dependencies Checked</b>", body_style), f"{report.total_edges_checked} imports", "-", "Analyzed"],
                [Paragraph("<b>Violations Flagged</b>", body_style), f"{len(report.violations)} issues", "0", "Clean" if len(report.violations) == 0 else "Action Required"]
            ]
            kpi_table = Table(kpi_data, colWidths=[160, 160, 90, 130])
            kpi_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ('PADDING', (0, 0), (-1, -1), 5),
                ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
                ('BACKGROUND', (3, 1), (3, 1), colors.HexColor("#dcfce7") if len(report.violations) == 0 else colors.HexColor("#fee2e2")),
            ]))
            story.append(kpi_table)
            story.append(Spacer(1, 10))

            # Findings
            if not report.violations:
                story.append(Paragraph("🛡️ Architectural Health Summary", h2_style))
                story.append(Paragraph("✓ <b>Zero architectural violations detected.</b> The codebase strictly conforms to all defined architectural layer boundaries.", body_style))
            else:
                story.append(Paragraph("⚠️ Flagged Architectural Violations & Remediation", h2_style))
                for idx, v in enumerate(report.violations, 1):
                    v_title = f"<b>#{idx}: {v.source_module} ({v.source_layer}) &rarr; {v.target_module} ({v.target_layer})</b>"
                    story.append(Paragraph(v_title, ParagraphStyle('VTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9.5, textColor=color_fail, spaceBefore=4)))
                    if v.line_number and v.code_snippet:
                        story.append(Paragraph(f"Line {v.line_number}: {v.code_snippet}", code_style))
                    if v.explanation:
                        story.append(Paragraph(f"<b>Hazard:</b> {v.explanation}", body_style))
                    if v.remediation:
                        story.append(Paragraph(f"<b>Fix:</b> {v.remediation}", ParagraphStyle('Fix', parent=body_style, textColor=color_pass)))
                    story.append(Spacer(1, 4))

            doc.build(story)
            click.secho(f"📄 Saved PDF compliance certificate to: {out_path}", fg="cyan")
        except Exception as e:
            click.secho(f"❌ Error generating PDF report: {e}", fg="red", err=True)


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIXTURES_DIR = os.path.join(BASE_DIR, "shared", "fixtures")

PRESET_BLUEPRINTS = {
    "clean": os.path.join(FIXTURES_DIR, "clean_architecture.json"),
    "archon": os.path.join(FIXTURES_DIR, "archon_architecture.json"),
    "mvc": os.path.join(FIXTURES_DIR, "mvc_architecture.json"),
    "layered": os.path.join(FIXTURES_DIR, "layered_architecture.json"),
    "3tier": os.path.join(FIXTURES_DIR, "layered_architecture.json")
}


def resolve_ruleset_path(rules_arg: Optional[str]) -> str:
    """Resolves blueprint argument: supports short names ('clean', 'archon', 'mvc') or custom file paths."""
    if not rules_arg:
        return PRESET_BLUEPRINTS["clean"]

    clean_arg = rules_arg.lower().strip()
    if clean_arg in PRESET_BLUEPRINTS:
        return PRESET_BLUEPRINTS[clean_arg]

    if os.path.exists(rules_arg):
        return os.path.abspath(rules_arg)

    # Check within fixtures directory
    candidate = os.path.join(FIXTURES_DIR, rules_arg)
    if os.path.exists(candidate):
        return candidate
    candidate_json = os.path.join(FIXTURES_DIR, f"{rules_arg}.json")
    if os.path.exists(candidate_json):
        return candidate_json

    return rules_arg


# ── Click CLI Group ───────────────────────────────────────────────────────────
@click.group()
@click.version_option(version="1.0.0", prog_name="archon")
def cli():
    """🏛️ Archon - Architecture Generation & Continuous Conformance Governance CLI"""
    pass


@cli.command("check")
@click.argument("target", required=False, default=None)
@click.option(
    "--repo", "-r",
    default=None,
    help="Path to the target codebase directory to audit. (Can also be passed as positional argument: 'archon check <path>')."
)
@click.option(
    "--rules", "-b",
    default="clean",
    help="Path or preset name for architecture ruleset ('clean', 'archon', 'mvc', 'layered'). Default: 'clean'."
)
@click.option(
    "--provider", "-p",
    type=click.Choice(["groq", "gemini", "nvidia", "openai", "qwen", "none"], case_sensitive=False),
    default="none",
    help="LLM provider for semantic classification. Default: 'none' (fast offline mode)."
)
@click.option(
    "--out", "-o",
    type=click.Path(writable=True),
    default=None,
    help="Optional output file path for the audit report (.json, .html, .md)."
)
@click.option(
    "--threshold", "-t",
    type=float,
    default=100.0,
    help="Minimum Architecture Health Score (0-100) required to pass. Default: 100.0."
)
@click.option(
    "--exclude", "-e",
    multiple=True,
    help="Directory name(s) to exclude from AST scanning (e.g. -e test_codebases -e tests)."
)
@click.option(
    "--fail-on-violation/--no-fail",
    default=True,
    help="Whether to exit with non-zero code (1) if violations exist or score is below threshold."
)
def check_command(target: Optional[str], repo: Optional[str], rules: str, provider: str, out: Optional[str], threshold: float, exclude: tuple, fail_on_violation: bool):
    """
    Audit a codebase against an architectural blueprint ruleset.
    Usage: archon check [TARGET_PATH] [OPTIONS]
    """
    codebase_path = target or repo or "."
    if not os.path.exists(codebase_path):
        click.secho(f"❌ Error: Target codebase directory does not exist: '{codebase_path}'", fg="red", err=True)
        sys.exit(2)

    rules_path = resolve_ruleset_path(rules)
    if not os.path.exists(rules_path):
        click.secho(f"❌ Error: Architecture ruleset file does not exist: '{rules_path}'", fg="red", err=True)
        sys.exit(2)

    click.secho("\n========================================================================", fg="blue", bold=True)
    click.secho("🏛️  ARCHON ARCHITECTURE CONFORMANCE AUDIT", fg="cyan", bold=True)
    click.secho("========================================================================", fg="blue", bold=True)

    # 1. Load and validate ruleset
    try:
        with open(rules_path, "r", encoding="utf-8") as f:
            rules_data = json.load(f)
        ruleset_obj = ArchitectureRuleset(**rules_data)
        click.echo(f"📋 Loaded Blueprint: {click.style(ruleset_obj.project_name, bold=True)} ({len(ruleset_obj.layers)} layers, {len(ruleset_obj.rules)} rules)")
    except Exception as e:
        click.secho(f"❌ Error validating ruleset JSON schema: {e}", fg="red", err=True)
        sys.exit(2)

    # 2. Extract AST dependencies
    click.echo(f"🔍 Scanning codebase AST: {click.style(os.path.abspath(codebase_path), bold=True)}")
    raw_deps = extract_project_dependencies(codebase_path, exclude_dirs=list(exclude))
    if not raw_deps:
        click.secho(f"⚠️  No Python source files found in {repo}.", fg="yellow")
        sys.exit(0)

    # 3. Build graph
    G = build_dependency_graph(raw_deps)
    internal_nodes = [n for n, d in G.nodes(data=True) if d.get("node_type") == "internal" or d.get("type") == "internal"]
    click.echo(f"📊 Reality Graph constructed: {len(internal_nodes)} modules, {G.number_of_edges()} total dependencies")

    # 4. Resolve layer mapping
    chosen_provider = provider or detect_default_provider()
    mapping = resolve_layer_mapping(internal_nodes, rules_data, ruleset_path=rules, provider=chosen_provider)

    # 5. Run deterministic checker
    report = check_architecture(G=G, mapping=mapping, ruleset=rules_data)

    # 6. Format and display results
    click.secho("\n------------------------------------------------------------------------", fg="blue")
    score_color = "green" if report.score >= 80 else ("yellow" if report.score >= 50 else "red")
    score_status = "PASS" if report.score >= threshold and len(report.violations) == 0 else "FAIL"

    click.echo(
        f"Architecture Health Score: "
        + click.style(f"{report.score:.1f}%", fg=score_color, bold=True)
        + f" [{click.style(score_status, fg='green' if score_status == 'PASS' else 'red', bold=True)}] "
        + f"(Pass Threshold: {threshold:.1f}%)"
    )
    click.echo(f"Dependencies Checked:     {report.total_edges_checked}")
    click.echo(f"Violations Flagged:       {len(report.violations)}")
    click.secho("------------------------------------------------------------------------\n", fg="blue")

    if report.violations:
        click.secho("⚠️  DETECTED ARCHITECTURAL VIOLATIONS:\n", fg="red", bold=True)
        for idx, v in enumerate(report.violations, 1):
            click.secho(f"[{idx}] {v.source_module} ({v.source_layer}) ➔ {v.target_module} ({v.target_layer})", fg="red", bold=True)
            if v.line_number and v.code_snippet:
                click.secho(f"    📍 File snippet (line {v.line_number}):", fg="bright_black")
                click.secho(f"       {v.code_snippet}", fg="yellow")
            if v.explanation:
                click.secho(f"    🧠 Architectural Hazard: {v.explanation}", fg="white")
            if v.remediation:
                click.secho(f"    💡 Recommended Fix:     {v.remediation}", fg="green")
            click.echo()
    else:
        click.secho("✓ CONFORMANCE CHECK PASSED: Codebase strictly conforms to the architecture blueprint!\n", fg="green", bold=True)

    # 7. Export report if requested
    if out:
        export_report(report, rules_data, codebase_path, out)

    # 8. Exit code
    if fail_on_violation and (len(report.violations) > 0 or report.score < threshold):
        click.secho(f"❌ Audit Failed: Found {len(report.violations)} violation(s). Exiting with code 1.\n", fg="red", bold=True)
        sys.exit(1)
    else:
        click.secho("✓ Audit Succeeded. Exiting with code 0.\n", fg="green", bold=True)
        sys.exit(0)


@cli.command("self-check")
@click.option(
    "--out", "-o",
    type=click.Path(writable=True),
    default=None,
    help="Optional output file path for the audit report (.json, .html, .md)."
)
@click.option(
    "--fail-on-violation/--no-fail",
    default=True,
    help="Whether to exit with non-zero code (1) if violations exist."
)
@click.pass_context
def self_check_command(ctx, out: Optional[str], fail_on_violation: bool):
    """
    Audit Archon on itself (Dogfooding mode).
    Scans Archon against archon_architecture.json, automatically excluding test codebases.
    """
    click.secho("\n🐶 Running Archon Self-Audit (Dogfooding mode)...", fg="magenta", bold=True)
    ctx.invoke(
        check_command,
        target=BASE_DIR,
        repo=None,
        rules="archon",
        provider="none",
        out=out,
        threshold=100.0,
        exclude=("test_codebases", "tests"),
        fail_on_violation=fail_on_violation
    )


@cli.command("generate")
@click.option(
    "--srs", "-s",
    required=True,
    type=click.Path(exists=True, file_okay=True, dir_okay=False, readable=True),
    help="Path to the Software Requirements Specification (SRS) text or markdown file."
)
@click.option(
    "--out", "-o",
    default="architecture.json",
    help="Output file path for the generated architecture blueprint ruleset JSON."
)
def generate_command(srs: str, out: str):
    """
    Generate an architectural blueprint ruleset from a Software Requirements Specification (SRS).
    (Connects to the Generation pipeline).
    """
    click.secho("\n========================================================================", fg="blue", bold=True)
    click.secho("🏛️  ARCHON ARCHITECTURE GENERATION PIPELINE", fg="cyan", bold=True)
    click.secho("========================================================================", fg="blue", bold=True)
    click.echo(f"📄 Reading SRS from: {click.style(srs, bold=True)}")
    click.echo(f"🤖 Multi-agent generation pipeline (Analyst -> Architect -> Evaluator)...")
    click.secho(f"ℹ️  Generation integration endpoint linked to generation/ pipeline.", fg="yellow")
    click.echo(f"Target output: {out}\n")


if __name__ == "__main__":
    cli()
