"""Conversational Elicitation Agent for ArcGen Phase A.

Interactively questions the user to elicit missing Architecturally Significant
Requirements (ASRs) without interrogation fatigue.
"""

import logging
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)
from generation.ArcGen.schemas.requirements import (
    SRSDocument,
    NormalizedRequirement,
    RequirementType,
    PriorityLevel,
    ArchitectureDriverDimension,
    ISO25010Characteristic,
    ISO25010SubCharacteristic,
)
from generation.ArcGen.schemas.elicitation import QuestionItem, ExtractedASR
from generation.ArcGen.phase_a.asr_tracker import ASRTracker
from generation.ArcGen.llm import BaseLLMClient, get_llm_client


QUESTION_GENERATOR_PROMPT = """You are a Principal Software Architect interviewing a system stakeholder.
Your task is to formulate ONE specific, targeted question to elicit a missing Architecturally Significant Requirement (ASR).

TARGET ASR CATEGORY: {target_dimension}
PROJECT CONTEXT: {project_context}

RULES:
1. TARGETED ARCHITECTURAL QUESTIONS ONLY:
   - Do NOT ask generic product-management questions (e.g., "What user features do you want?", "What colors?").
   - Focus strictly on technical and architectural drivers: scale, latency budgets, data consistency, uptime, cloud/hosting target, or budget.
2. PREVENT INTERROGATION FATIGUE:
   - Provide a 1-sentence "why_it_matters" explaining the architectural trade-off at stake (e.g., "Whether you need immediate ACID consistency dictates whether we can use an event-driven broker or require a relational database").
   - Offer 2 to 3 concrete, realistic options/benchmarks to make answering effortless.

OUTPUT MUST BE VALID JSON:
{{
  "question_id": "Q-{dimension_code}-01",
  "target_dimension": "{target_dimension}",
  "question_text": "...",
  "why_it_matters": "...",
  "suggested_options": ["Option 1...", "Option 2...", "Option 3..."]
}}
"""

ANSWER_EXTRACTION_PROMPT = """You are an architectural requirement analyst.
Analyze the user's answer to the architectural question and extract the technical constraint or metric.

TARGET CATEGORY: {target_dimension}
QUESTION ASKED: {question_text}
USER RESPONSE: \"{user_response}\"

RULES:
1. If the user provided a meaningful constraint, extract:
   - "raw_text": The architectural statement.
   - "metric": The quantifiable dimension (e.g. "peak throughput", "p99 latency", "consistency model", "uptime SLA", "monthly budget").
   - "value": The numeric or qualitative value (e.g. "10000", "50", "Strong ACID", "99.9%").
   - "unit": (e.g. "req/s", "ms", "%", "USD").
2. If the user said "skip", "not sure", "don't know", "standard", or provided no architectural information:
   - Set "value" to null and confidence to 0.0.

OUTPUT MUST BE VALID JSON:
{{
  "dimension": "{target_dimension}",
  "raw_text": "...",
  "metric": "...",
  "value": "...",
  "unit": "...",
  "confidence": 1.0
}}
"""


DIMENSION_DEFAULT_OPTIONS = {
    ArchitectureDriverDimension.THROUGHPUT_SCALE: [
        "100 - 1,000 req/sec (Standard web scale)",
        "10,000 - 50,000 req/sec (High throughput)",
        "100,000+ req/sec (Massive scale)",
    ],
    ArchitectureDriverDimension.LATENCY_BUDGET: [
        "< 100ms p99 latency (Real-time interactive)",
        "200ms - 500ms p99 (Standard API)",
        "Batch / Async processing (Tolerates seconds to hours)",
    ],
    ArchitectureDriverDimension.DATA_CONSISTENCY: [
        "Strong ACID consistency (Synchronous transactions, relational)",
        "Eventual consistency (High availability, distributed datastores)",
        "Hybrid (Immediate consistency for core state, eventual for reporting/views)",
    ],
    ArchitectureDriverDimension.AVAILABILITY_FAULT_TOLERANCE: [
        "99.9% uptime (~8.7 hours downtime/year, standard redundancy)",
        "99.99% uptime (~52 minutes downtime/year, multi-region failover)",
        "99.999% uptime (High-availability mission-critical, zero downtime)",
    ],
    ArchitectureDriverDimension.SECURITY_COMPLIANCE: [
        "Standard enterprise security (Role-Based Access Control, TLS 1.3, AES-256 at rest)",
        "High compliance (HIPAA, PCI-DSS, SOC-2, strict audit logs)",
        "Zero-Trust / Military grade (mTLS between all services, end-to-end encryption)",
    ],
    ArchitectureDriverDimension.DEPLOYMENT_TARGET: [
        "Managed Cloud / Kubernetes (AWS EKS, GCP GKE, Azure AKS)",
        "Serverless / Container Platform (AWS ECS, Google Cloud Run)",
        "On-Premises / Bare-Metal datacenter",
    ],
    ArchitectureDriverDimension.COST_CONSTRAINT: [
        "Cost-optimized / Minimal operational budget (< $500/mo)",
        "Moderate operational budget (Balanced scale vs cost)",
        "Performance-first / Budget is secondary to reliability & throughput",
    ],
}


class ElicitationAgent:
    """Orchestrates Phase A ASR elicitation interview loop."""

    def __init__(self, client: Optional[BaseLLMClient] = None):
        self.client = client or get_llm_client()

    def initial_assessment(
        self, initial_prompt: str, tracker: ASRTracker
    ) -> List[ExtractedASR]:
        """Scans initial prompt and pre-fills any already specified ASR dimensions."""
        prompt_content = initial_prompt
        if len(prompt_content) > 12000:
            prompt_content = prompt_content[:12000] + "\n...[Additional requirements omitted for initial driver extraction]..."

        user_prompt = f"""ANALYZE THIS INITIAL SYSTEM PROMPT:
\"\"\"
{prompt_content}
\"\"\"

Identify any of the 7 core architectural driver dimensions that are ALREADY explicitly stated:
1. Throughput / Scale
2. Latency Budget
3. Data Consistency Model
4. Availability / Fault Tolerance
5. Security / Compliance
6. Deployment Target
7. Cost Constraint

OUTPUT MUST BE A JSON OBJECT:
{{
  "extracted": [
    {{
      "dimension": "Throughput / Scale",
      "raw_text": "Must support 5,000 drivers",
      "metric": "concurrent users",
      "value": "5000",
      "unit": "users",
      "confidence": 1.0
    }}
  ]
}}"""

        try:
            data = self.client.generate_json(
                system_prompt="You are an expert requirements parser extracting pre-existing architectural drivers.",
                user_prompt=user_prompt,
                temperature=0.1,
            )
            extracted_list = []
            for item in data.get("extracted", []):
                for dim in ArchitectureDriverDimension:
                    if dim.value.lower() == item.get("dimension", "").lower():
                        val = item.get("value")
                        val_str = str(val) if val is not None else None
                        asr = ExtractedASR(
                            dimension=dim,
                            raw_text=item.get("raw_text", ""),
                            metric=item.get("metric"),
                            value=val_str,
                            unit=item.get("unit"),
                            confidence=float(item.get("confidence", 1.0)),
                        )
                        tracker.record_slot(
                            dimension=dim,
                            raw_text=asr.raw_text,
                            metric=asr.metric,
                            value=val_str,
                            unit=asr.unit,
                        )
                        extracted_list.append(asr)
            return extracted_list
        except Exception as e:
            logger.warning(f"Initial assessment failed: {e}")
            return []

    def generate_question(
        self, tracker: ASRTracker, project_context: str
    ) -> Optional[QuestionItem]:
        """Generates a targeted architectural question for the highest-priority unfilled slot."""
        unfilled = tracker.unfilled_categories()
        if not unfilled:
            return None

        target_dim = unfilled[0]
        code = target_dim.name[:4]

        ctx = project_context
        if len(ctx) > 1500:
            ctx = ctx[:1500] + "..."

        prompt = QUESTION_GENERATOR_PROMPT.format(
            target_dimension=target_dim.value,
            dimension_code=code,
            project_context=ctx,
        )

        try:
            data = self.client.generate_json(
                system_prompt="You are a Principal Software Architect formulating a clarifying question.",
                user_prompt=prompt,
                temperature=0.2,
            )
            options = data.get("suggested_options") or []
            if not options:
                options = DIMENSION_DEFAULT_OPTIONS.get(target_dim, [])
            return QuestionItem(
                question_id=data.get("question_id", f"Q-{code}-01"),
                target_dimension=target_dim,
                question_text=data.get("question_text", f"What is your target for {target_dim.value}?"),
                why_it_matters=data.get("why_it_matters", "Guides architectural pattern selection."),
                suggested_options=options,
            )
        except Exception as e:
            logger.warning(f"Question generation failed ({e}), using fallback.")
            return QuestionItem(
                question_id=f"Q-{code}-01",
                target_dimension=target_dim,
                question_text=f"What are your specific requirements for {target_dim.value}?",
                why_it_matters="Critical for choosing between monolithic and distributed topologies.",
                suggested_options=DIMENSION_DEFAULT_OPTIONS.get(target_dim, []),
            )

    def process_answer(
        self,
        question: QuestionItem,
        user_response: str,
        tracker: ASRTracker,
    ) -> Optional[ExtractedASR]:
        """Extracts structured ASR attributes from user response and records it in tracker."""
        prompt = ANSWER_EXTRACTION_PROMPT.format(
            target_dimension=question.target_dimension.value,
            question_text=question.question_text,
            user_response=user_response,
        )

        try:
            data = self.client.generate_json(
                system_prompt="You extract technical architectural constraints from interview responses.",
                user_prompt=prompt,
                temperature=0.1,
            )

            val = data.get("value")
            if val is not None and str(val).lower() not in ("null", "none", "skip") and float(data.get("confidence", 1.0)) >= 0.5:
                val_str = str(val)
                asr = ExtractedASR(
                    dimension=question.target_dimension,
                    raw_text=data.get("raw_text", user_response),
                    metric=data.get("metric"),
                    value=val_str,
                    unit=data.get("unit"),
                    confidence=float(data.get("confidence", 1.0)),
                )
                tracker.record_slot(
                    dimension=question.target_dimension,
                    raw_text=asr.raw_text,
                    metric=asr.metric,
                    value=val_str,
                    unit=asr.unit,
                )
                return asr
        except Exception as e:
            logger.warning(f"Answer processing failed: {e}")

        return None

    def synthesize_srs(
        self, initial_prompt: str, tracker: ASRTracker
    ) -> SRSDocument:
        """Assembles initial prompt and all elicited ASR slots into a complete SRSDocument."""
        asrs: List[NormalizedRequirement] = []
        asr_idx = 1

        for dim, slot in tracker.slots.items():
            if slot.filled and slot.raw_response:
                asrs.append(
                    NormalizedRequirement(
                        req_id=f"ASR-{asr_idx:03d}",
                        raw_text=f"{dim.value}: {slot.raw_response}",
                        req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                        arch_dimension=dim,
                        metric=slot.metric,
                        target_value=slot.value,
                        unit=slot.unit,
                        priority=PriorityLevel.CRITICAL if slot.weight >= 5.0 else PriorityLevel.HIGH,
                    )
                )
                asr_idx += 1

        # Use the normalizer on the initial prompt for FRs/actors
        from generation.ArcGen.phase_b.normalizer import normalize_srs
        base_srs = normalize_srs(initial_prompt, client=self.client)

        # Merge elicited ASRs
        base_srs.asrs.extend(asrs)
        return base_srs
