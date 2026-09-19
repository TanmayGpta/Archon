"""Pass 1: Architectural Component (Node) Generator.

Decomposes normalized requirements into concrete architectural components
constrained by the selected pattern and citation discipline.
"""

import logging
from typing import List, Optional
from generation.ArcGen.schemas.requirements import SRSDocument
from generation.ArcGen.schemas.architecture import ArchNode, NodeType
from generation.ArcGen.schemas.patterns import PatternProfile
from generation.ArcGen.llm import BaseLLMClient, get_llm_client

logger = logging.getLogger(__name__)


NODE_GENERATOR_SYSTEM_PROMPT = """You are a Principal Software Architect.
Your task is to decompose a software system into concrete architectural components (nodes)
strictly conforming to the designated Primary Architectural Pattern and its companion patterns.

CRITICAL RULES:
1. STRICT CITATION DISCIPLINE (Anti-Hallucination):
   - EVERY component MUST trace to at least one Requirement ID ("traced_requirements") from the provided SRS.
   - Do NOT invent infrastructure or services that are not required by any requirement.
   - EVERY component MUST include at least one Knowledge Base citation ("kb_citations") referencing the primary pattern ID or companion pattern IDs.

2. COMPONENT DECOMPOSITION RULES:
   - Match the topology of the primary pattern:
     * If Monolithic / Modular Monolith: decompose into distinct domain modules or packages within layers.
     * If Distributed / Microservices: decompose into autonomous microservices with dedicated datastores.
     * If Event-Driven: include message broker/queue nodes and event consumer/producer components.
   - Assign exact "node_type": One of ["service", "module", "datastore", "gateway", "external", "queue", "cache"].
   - Assign exact "layer": One of ["Presentation", "Application", "Domain", "Infrastructure"].
   - Assign sequential IDs: "COMP-001", "COMP-002", ...

OUTPUT MUST BE VALID JSON:
{
  "nodes": [
    {
      "node_id": "COMP-001",
      "name": "OrderService",
      "node_type": "service",
      "layer": "Application",
      "description": "Orchestrates order creation, validation, and fulfillment workflows.",
      "responsibilities": ["Validate order items", "Initiate payment workflow", "Publish OrderCreated event"],
      "traced_requirements": ["FR-001", "ASR-001"],
      "kb_citations": ["PAT-MICROSERVICES"]
    }
  ]
}
"""


def generate_nodes(
    srs: SRSDocument,
    primary_pattern: PatternProfile,
    companion_patterns: Optional[List[PatternProfile]] = None,
    client: Optional[BaseLLMClient] = None,
) -> List[ArchNode]:
    """Generates architectural components (nodes) grounded in SRS requirements and KB patterns."""
    if client is None:
        client = get_llm_client()

    if companion_patterns is None:
        companion_patterns = []

    # Prepare requirement summaries for prompt
    req_summaries = []
    for req in srs.all_requirements:
        req_summaries.append(f"- [{req.req_id}] ({req.req_type.value}) {req.raw_text}")
    req_text = "\n".join(req_summaries)

    companion_text = ", ".join([f"{p.name} ({p.pattern_id})" for p in companion_patterns]) or "None"

    user_prompt = f"""PROJECT: {srs.project_name} (Domain: {srs.domain})
PRIMARY PATTERN: {primary_pattern.name} ({primary_pattern.pattern_id})
TOPOLOGY: {primary_pattern.topology_type.value}
COMPANION PATTERNS: {companion_text}
PATTERN RESOLVED FORCES: {', '.join(primary_pattern.forces_resolved)}

ACTORS: {', '.join(srs.actors) or 'None'}
EXTERNAL SYSTEMS: {', '.join(srs.external_systems) or 'None'}
CORE DATA OBJECTS: {', '.join(srs.data_objects) or 'None'}

REQUIREMENTS LIST:
{req_text}

Decompose this system into architectural components (nodes). Output JSON conforming to the schema."""

    data = client.generate_json(
        system_prompt=NODE_GENERATOR_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.1,
    )

    if isinstance(data, list):
        nodes_data = data
    elif isinstance(data, dict):
        nodes_data = data.get("nodes") or data.get("components") or []
    else:
        nodes_data = []

    default_req_id = srs.all_requirements[0].req_id if srs.all_requirements else "FR-001"

    nodes: List[ArchNode] = []
    for i, n in enumerate(nodes_data):
        if not isinstance(n, dict):
            continue

        # Pre-sanitize and resolve aliases for traced_requirements
        reqs = n.get("traced_requirements") or n.get("requirements") or n.get("traced_reqs") or []
        if isinstance(reqs, str):
            reqs = [reqs]
        elif not isinstance(reqs, list):
            reqs = []
        if not reqs and default_req_id:
            reqs = [default_req_id]
        n["traced_requirements"] = reqs

        # Pre-sanitize kb_citations
        cits = n.get("kb_citations") or n.get("citations") or []
        if isinstance(cits, str):
            cits = [cits]
        elif not isinstance(cits, list):
            cits = []
        if not cits:
            cits = [primary_pattern.pattern_id]
        n["kb_citations"] = cits

        # Ensure node_id, name, and defaults
        if not n.get("node_id"):
            n["node_id"] = f"COMP-{i+1:03d}"
        if not n.get("name"):
            n["name"] = f"Component_{i+1}"
        if not n.get("node_type"):
            n["node_type"] = "service"
        if not n.get("description"):
            n["description"] = f"Architectural component {n.get('name')}"

        try:
            node = ArchNode.model_validate(n)
            nodes.append(node)
        except Exception as err:
            logger.warning(f"Could not validate component node {n.get('node_id')}: {err}")

    # Ensure at least one component exists
    if not nodes:
        nodes.append(
            ArchNode(
                node_id="COMP-001",
                name="CoreService",
                node_type=NodeType.SERVICE,
                layer="Application",
                description="Core application service executing primary system requirements.",
                responsibilities=["Process primary system domain workflows"],
                traced_requirements=[default_req_id],
                kb_citations=[primary_pattern.pattern_id],
            )
        )

    # Post-validation fallback: ensure every node has at least one citation and requirement
    for node in nodes:
        if not node.kb_citations:
            node.kb_citations.append(primary_pattern.pattern_id)
        if not node.traced_requirements and default_req_id:
            node.traced_requirements.append(default_req_id)

    return nodes
