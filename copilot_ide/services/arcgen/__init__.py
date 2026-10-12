"""ArcGen: Requirement-Grounded Software Architecture Generation Service.

Provides:
- Phase A: Interactive ASR requirement elicitation with computed stopping criteria
- Phase B: Deterministic ATAM pattern matching, two-pass node & edge generation, zero-orphan validation
"""

from .generator import generate_architecture_from_srs
from .llm import get_llm_client, BaseLLMClient, OmniKeyClient, GroqClient, OllamaClient
from .schemas.architecture import ArchitectureGraph, ArchNode, ArchEdge
from .schemas.requirements import SRSDocument

__all__ = [
    "generate_architecture_from_srs",
    "get_llm_client",
    "BaseLLMClient",
    "OmniKeyClient",
    "GroqClient",
    "OllamaClient",
    "ArchitectureGraph",
    "ArchNode",
    "ArchEdge",
    "SRSDocument",
]
