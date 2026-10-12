"""Schemas package for ArcGen.

Contains data models for requirements, architecture graphs, patterns, and elicitation.
"""

from .requirements import (
    ISO25010Characteristic,
    ISO25010SubCharacteristic,
    ArchitectureDriverDimension,
    RequirementType,
    NormalizedRequirement,
    SRSDocument,
)
from .architecture import (
    ArchNode,
    ArchEdge,
    ArchitectureGraph,
)
from .patterns import (
    PatternProfile,
    PatternImpactProfile,
    PatternRole,
    TradeoffEvaluation,
)
from .elicitation import (
    QuestionItem,
    ExtractedASR,
    ElicitationTurn,
)

__all__ = [
    "ISO25010Characteristic",
    "ISO25010SubCharacteristic",
    "ArchitectureDriverDimension",
    "RequirementType",
    "NormalizedRequirement",
    "SRSDocument",
    "ArchNode",
    "ArchEdge",
    "ArchitectureGraph",
    "PatternProfile",
    "PatternImpactProfile",
    "PatternRole",
    "TradeoffEvaluation",
    "QuestionItem",
    "ExtractedASR",
    "ElicitationTurn",
]
