"""Deterministic ATAM-style Pattern Matcher.

Evaluates an SRSDocument against the curated Knowledge Base.
Performs hard anti-requisite filtering, weighted ISO 25010 scoring,
and tradeoff point identification without LLM randomness.
"""

from typing import List, Dict, Optional, Tuple
from generation.ArcGen.schemas.requirements import (
    SRSDocument,
    NormalizedRequirement,
    PriorityLevel,
    ArchitectureDriverDimension,
    ISO25010SubCharacteristic,
)
from generation.ArcGen.schemas.patterns import (
    PatternProfile,
    PatternRole,
    TradeoffEvaluation,
)
from generation.ArcGen.knowledge_base.loader import PatternCatalog, get_catalog

# Priority to numerical weight mapping
PRIORITY_WEIGHTS: Dict[PriorityLevel, float] = {
    PriorityLevel.CRITICAL: 5.0,
    PriorityLevel.HIGH: 4.0,
    PriorityLevel.MEDIUM: 3.0,
    PriorityLevel.LOW: 1.0,
}

# Mapping from ArchitectureDriverDimension to relevant ISO 25010 sub-characteristics
DIMENSION_TO_ISO_SUBS: Dict[ArchitectureDriverDimension, List[str]] = {
    ArchitectureDriverDimension.THROUGHPUT_SCALE: ["Capacity", "Scalability"],
    ArchitectureDriverDimension.LATENCY_BUDGET: ["Time behavior"],
    ArchitectureDriverDimension.DATA_CONSISTENCY: ["Integrity"],
    ArchitectureDriverDimension.AVAILABILITY_FAULT_TOLERANCE: ["Availability", "Fault tolerance", "Recoverability"],
    ArchitectureDriverDimension.SECURITY_COMPLIANCE: ["Confidentiality", "Integrity"],
    ArchitectureDriverDimension.DEPLOYMENT_TARGET: ["Modularity", "Adaptability", "Interoperability"],
    ArchitectureDriverDimension.COST_CONSTRAINT: ["Resource utilization"],
}


def _check_disqualifications(
    pattern: PatternProfile, srs: SRSDocument
) -> Tuple[bool, List[str]]:
    """Checks hard disqualifiers (anti-requisites and physical limits)."""
    disqualified = False
    reasons: List[str] = []

    # Check all ASRs against pattern limits
    for asr in srs.asrs:
        text_lower = asr.raw_text.lower()

        # 1. Data consistency model checks
        if asr.arch_dimension == ArchitectureDriverDimension.DATA_CONSISTENCY:
            if "strong" in text_lower or "acid" in text_lower or "atomic" in text_lower:
                if "Strong" not in pattern.limits.supported_consistency:
                    disqualified = True
                    reasons.append(
                        f"Requires Strong ACID consistency, but {pattern.name} only supports "
                        f"{pattern.limits.supported_consistency}"
                    )

        # 2. Scale limits check
        if asr.arch_dimension == ArchitectureDriverDimension.THROUGHPUT_SCALE:
            if asr.target_value and isinstance(asr.target_value, (int, float)):
                if pattern.limits.max_scale_rps and asr.target_value > pattern.limits.max_scale_rps:
                    disqualified = True
                    reasons.append(
                        f"Requires {asr.target_value} rps, which exceeds {pattern.name} ceiling of "
                        f"{pattern.limits.max_scale_rps} rps"
                    )

        # 3. Cost / operational complexity checks
        if asr.arch_dimension == ArchitectureDriverDimension.COST_CONSTRAINT:
            if "tight" in text_lower or "low budget" in text_lower or "minimal cost" in text_lower:
                if pattern.limits.cost_factor >= 4 or pattern.limits.operational_complexity >= 4:
                    disqualified = True
                    reasons.append(
                        f"Requires low cost / low operational overhead, but {pattern.name} has "
                        f"cost factor {pattern.limits.cost_factor}/5 and complexity {pattern.limits.operational_complexity}/5"
                    )

        # 4. Keyword matches against anti-requisites
        for anti_req in pattern.anti_requisites:
            anti_lower = anti_req.lower()
            if "small team" in anti_lower and ("small team" in text_lower or "single developer" in text_lower):
                disqualified = True
                reasons.append(f"Anti-requisite triggered: {anti_req}")
            elif "greenfield" in anti_lower and ("greenfield" in text_lower or "new system" in text_lower):
                disqualified = True
                reasons.append(f"Anti-requisite triggered: {anti_req}")

    return disqualified, reasons


def _compute_pattern_score(
    pattern: PatternProfile, srs: SRSDocument
) -> Tuple[float, Dict[str, float]]:
    """Calculates deterministic weighted ATAM composite score for a pattern."""
    total_score = 0.0
    breakdown: Dict[str, float] = {}

    evaluated_reqs = srs.asrs + srs.non_functional_requirements

    for req in evaluated_reqs:
        weight = PRIORITY_WEIGHTS.get(req.priority, 3.0)
        
        # Determine target sub-characteristics to evaluate
        target_subs: List[str] = []
        if req.iso_sub:
            target_subs.append(req.iso_sub.value)
        elif req.arch_dimension and req.arch_dimension in DIMENSION_TO_ISO_SUBS:
            target_subs.extend(DIMENSION_TO_ISO_SUBS[req.arch_dimension])

        for sub_name in target_subs:
            impact = pattern.iso25010_impact.get(sub_name, 0)
            score_contribution = weight * impact
            breakdown[f"{req.req_id} ({sub_name})"] = score_contribution
            total_score += score_contribution

    return total_score, breakdown


def _identify_active_tradeoffs(pattern: PatternProfile) -> List[str]:
    """Identifies co-existing positive and negative forces in the pattern."""
    tradeoffs = []
    positive_subs = [k for k, v in pattern.iso25010_impact.items() if v >= 2]
    negative_subs = [k for k, v in pattern.iso25010_impact.items() if v <= -1]

    for pos in positive_subs:
        for neg in negative_subs:
            tradeoffs.append(
                f"Promotes {pos} (+{pattern.iso25010_impact[pos]}) at expense of "
                f"{neg} ({pattern.iso25010_impact[neg]})"
            )

    return tradeoffs[:5]  # Cap at top 5 most prominent tradeoffs


def match_patterns(
    srs: SRSDocument, catalog: Optional[PatternCatalog] = None
) -> List[TradeoffEvaluation]:
    """Deterministically evaluates all KB patterns against the SRS requirements."""
    if catalog is None:
        catalog = get_catalog()

    macro_evals: List[TradeoffEvaluation] = []
    companion_evals: List[TradeoffEvaluation] = []

    for pattern in catalog.list_all():
        is_disqualified, reasons = _check_disqualifications(pattern, srs)
        score, breakdown = _compute_pattern_score(pattern, srs)
        tradeoffs = _identify_active_tradeoffs(pattern)

        # Occam's razor simplicity penalty for tie-breaking:
        # Penalizes extreme operational complexity and infrastructure cost factor
        simplicity_penalty = (
            0.5 * pattern.limits.operational_complexity + 0.5 * pattern.limits.cost_factor
        )
        adjusted_score = score - simplicity_penalty

        evaluation = TradeoffEvaluation(
            pattern_id=pattern.pattern_id,
            pattern_name=pattern.name,
            catalog_source=pattern.catalog_source,
            topology_type=pattern.topology_type,
            pattern_role=pattern.pattern_role,
            composite_score=score,
            adjusted_score=adjusted_score,
            dimension_breakdown=breakdown,
            disqualified=is_disqualified,
            disqualification_reasons=reasons,
            active_tradeoffs=tradeoffs,
        )

        if pattern.pattern_role == PatternRole.MACRO_STYLE:
            macro_evals.append(evaluation)
        else:
            companion_evals.append(evaluation)

    # Sort Macro Styles by adjusted score descending (tie-breaker: raw score, then simplicity)
    macro_evals.sort(
        key=lambda e: (not e.disqualified, e.adjusted_score, e.composite_score),
        reverse=True,
    )

    # Assign recommendation ranks for Macro Styles
    rank = 1
    for ev in macro_evals:
        if not ev.disqualified:
            ev.recommendation_rank = rank
            rank += 1
        else:
            ev.recommendation_rank = None

    # Sort Companions similarly
    companion_evals.sort(
        key=lambda e: (not e.disqualified, e.adjusted_score, e.composite_score),
        reverse=True,
    )
    c_rank = 1
    for ev in companion_evals:
        if not ev.disqualified:
            ev.recommendation_rank = c_rank
            c_rank += 1
        else:
            ev.recommendation_rank = None

    # Return macro styles first (primary candidates), followed by companions
    return macro_evals + companion_evals


def format_tradeoff_table(
    evaluations: List[TradeoffEvaluation], srs: SRSDocument, top_k: int = 4
) -> str:
    """Generates an ATAM-style markdown tradeoff comparison table for Macro Architectural Styles."""
    macro_evals = [e for e in evaluations if e.pattern_role == PatternRole.MACRO_STYLE]
    top_evals = macro_evals[:top_k]
    if not top_evals:
        return "No macro architectural styles evaluated."

    headers = ["Requirement / Driver", "Priority", "ISO Sub-Characteristic"]
    for ev in top_evals:
        status_tag = f" (Rank {ev.recommendation_rank})" if not ev.disqualified else " [DISQUALIFIED]"
        headers.append(f"{ev.pattern_name}{status_tag}")

    table_lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join([":---"] * 3 + [":---:"] * len(top_evals)) + " |",
    ]

    all_reqs = srs.asrs + srs.non_functional_requirements
    catalog = get_catalog()

    for req in all_reqs:
        sub = req.iso_sub.value if req.iso_sub else (
            DIMENSION_TO_ISO_SUBS.get(req.arch_dimension, ["General"])[0] if req.arch_dimension else "General"
        )
        row = [f"**{req.req_id}**: {req.raw_text[:40]}...", req.priority.value, sub]

        for ev in top_evals:
            pattern = catalog.get(ev.pattern_id)
            impact = pattern.iso25010_impact.get(sub, 0) if pattern else 0
            if impact > 0:
                row.append(f"+{impact}")
            elif impact < 0:
                row.append(f"**{impact}**")
            else:
                row.append("0")

        table_lines.append("| " + " | ".join(row) + " |")

    # Composite score row
    summary_row = ["**RAW COMPOSITE SCORE**", "-", "-"]
    for ev in top_evals:
        prefix = "**" if not ev.disqualified else "~~"
        suffix = "**" if not ev.disqualified else "~~"
        summary_row.append(f"{prefix}{ev.composite_score:+.1f}{suffix}")
    table_lines.append("| " + " | ".join(summary_row) + " |")

    # Adjusted score row (with Occam's razor complexity penalty)
    adj_row = ["**OCCAM ADJUSTED SCORE**", "-", "-"]
    for ev in top_evals:
        prefix = "**" if not ev.disqualified else "~~"
        suffix = "**" if not ev.disqualified else "~~"
        adj_row.append(f"{prefix}{ev.adjusted_score:+.1f}{suffix}")
    table_lines.append("| " + " | ".join(adj_row) + " |")

    # Status row
    status_row = ["**STATUS**", "-", "-"]
    for ev in top_evals:
        if ev.disqualified:
            status_row.append(f"**REJECTED**<br/>({ev.disqualification_reasons[0][:40]}...)")
        else:
            status_row.append(f"**Rank {ev.recommendation_rank}**")
    table_lines.append("| " + " | ".join(status_row) + " |")

    # Append recommended companion building blocks
    companion_evals = [e for e in evaluations if e.pattern_role == PatternRole.COMPANION and not e.disqualified][:3]
    if companion_evals:
        table_lines.append("\n**Recommended Companion Building Blocks:**")
        for c in companion_evals:
            table_lines.append(f"- **{c.pattern_name}** (Score: {c.adjusted_score:+.1f}) — *{c.catalog_source}*")

    return "\n".join(table_lines)

