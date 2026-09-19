"""Requirement Normalizer for ArcGen Phase B.

Ingests raw SRS text and normalizes it into the canonical SRSDocument schema
with ISO/IEC 25010 classifications, canonical IDs, and ASR driver dimensions.
Includes content-hashed caching to avoid redundant LLM invocations.
"""

import hashlib
import json
import logging
from pathlib import Path
from typing import Optional
from generation.ArcGen.schemas.requirements import (
    SRSDocument,
    NormalizedRequirement,
    RequirementType,
    PriorityLevel,
    ArchitectureDriverDimension,
    ISO25010Characteristic,
    ISO25010SubCharacteristic,
)
from generation.ArcGen.llm import BaseLLMClient, get_llm_client

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"

NORMALIZER_SYSTEM_PROMPT = """You are a Principal Software Requirements Architect specializing in ISO/IEC 25010:2023.
Your task is to analyze the provided raw Software Requirements Specification (SRS) and normalize it into a clean, structured JSON format.

RULES FOR NORMALIZATION:
1. Canonical IDs:
   - Functional Requirements: "FR-001", "FR-002", ...
   - Non-Functional Requirements: "NFR-001", "NFR-002", ...
   - Architecturally Significant Requirements (ASRs): "ASR-001", "ASR-002", ...
     * ASRs are requirements that dictate major architectural choices (e.g., scale > 10k rps, p99 latency SLAs, strict ACID consistency, 99.99% availability, security encryption, multi-tenant deployment, tight budget).
   - Technical Constraints: "TC-001", "TC-002", ... (e.g., legacy Windows NT, C/C++, TCP/IP, specific protocols).

2. Capability-Level Consolidation:
   - Consolidate repetitive operational statements that describe individual button clicks or telemetry points of the same entity into unified capability-level requirements (e.g. group 20 camera parameter adjustments into 'Camera Parameter & Telemetry Management').
   - Preserve all unique architectural drivers, SLAs, protocols, and security constraints.

3. Classification:
   - For every NFR and ASR, assign:
     * "iso_characteristic": One of ["Functional Suitability", "Performance Efficiency", "Compatibility", "Interaction Capability", "Reliability", "Security", "Maintainability", "Flexibility", "Safety"]
     * "iso_sub": One of ["Time behavior", "Capacity", "Resource utilization", "Availability", "Fault tolerance", "Recoverability", "Confidentiality", "Integrity", "Modularity", "Scalability", "Testability", "Modifiability"]
   - For every ASR, assign "arch_dimension": One of:
     ["Throughput / Scale", "Latency Budget", "Data Consistency Model", "Availability / Fault Tolerance", "Security / Compliance", "Deployment Target", "Cost Constraint"]

4. Measurable attributes:
   - Extract "metric" (e.g., "p99 response time", "throughput"), "target_value" (e.g., 50, 10000), "unit" (e.g., "ms", "req/s"), and "comparator" (e.g., "<=", ">=").

5. Extract System Context:
   - "actors": List of user roles / actors.
   - "external_systems": List of external services / third-party systems.
   - "data_objects": List of key business entities.

OUTPUT MUST BE VALID JSON with this structure:
{
  "project_name": "string",
  "domain": "string",
  "actors": ["string"],
  "external_systems": ["string"],
  "data_objects": ["string"],
  "functional_requirements": [
    {
      "req_id": "FR-001",
      "raw_text": "...",
      "req_type": "FR",
      "priority": "High"
    }
  ],
  "non_functional_requirements": [
    {
      "req_id": "NFR-001",
      "raw_text": "...",
      "req_type": "NFR",
      "iso_characteristic": "Performance Efficiency",
      "iso_sub": "Time behavior",
      "priority": "Medium"
    }
  ],
  "asrs": [
    {
      "req_id": "ASR-001",
      "raw_text": "...",
      "req_type": "ASR",
      "iso_characteristic": "Performance Efficiency",
      "iso_sub": "Capacity",
      "arch_dimension": "Throughput / Scale",
      "metric": "peak throughput",
      "target_value": 10000,
      "unit": "req/s",
      "priority": "Critical"
    }
  ],
  "technical_constraints": [
    {
      "req_id": "TC-001",
      "raw_text": "...",
      "req_type": "TC",
      "priority": "High"
    }
  ]
}
"""


def normalize_srs(
    raw_text: str,
    project_name: Optional[str] = None,
    client: Optional[BaseLLMClient] = None,
    use_cache: bool = True,
) -> SRSDocument:
    """Extracts and normalizes requirements from raw text with caching."""
    # Check cache
    cache_key = hashlib.sha256(raw_text.strip().encode("utf-8")).hexdigest()[:16]
    cache_file = CACHE_DIR / f"srs_{cache_key}.json"

    if use_cache and cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
            logger.info(f"Loaded normalized SRS from cache: {cache_file.name}")
            return SRSDocument.model_validate(cached_data)
        except Exception as e:
            logger.warning(f"Failed to read SRS cache ({e}), re-normalizing...")

    if client is None:
        client = get_llm_client()

    user_prompt = f"""PROJECT NAME HINT: {project_name or 'Extract from text'}

RAW REQUIREMENTS TEXT:
\"\"\"
{raw_text}
\"\"\"

Produce the normalized JSON representation conforming to the rules."""

    data = client.generate_json(
        system_prompt=NORMALIZER_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.1,
    )

    if project_name and not data.get("project_name"):
        data["project_name"] = project_name

    # Validate against Pydantic model
    doc = SRSDocument.model_validate(data)

    # Save to cache
    if use_cache:
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(doc.model_dump(), f, indent=2)
            logger.info(f"Saved normalized SRS to cache: {cache_file.name}")
        except Exception as e:
            logger.warning(f"Failed to write SRS cache: {e}")

    return doc
