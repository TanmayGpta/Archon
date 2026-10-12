"""Pattern schemas for the curated architectural knowledge base.

Encodes pattern tradeoff profiles, operational limits, applicability rules,
and anti-requisites for deterministic ATAM scoring.
"""

from enum import Enum
from typing import List, Dict, Optional
from pydantic import BaseModel, Field


class TopologyType(str, Enum):
    MONOLITHIC = "Monolithic"
    DISTRIBUTED = "Distributed"
    HYBRID = "Hybrid"


class PatternRole(str, Enum):
    """Classification between primary macro architectures and tactical companions."""
    MACRO_STYLE = "MacroStyle"       # System skeleton (Microservices, Modular Monolith, Layered, etc.)
    COMPANION = "Companion"          # Building block (API Gateway, BFF, Database per Service, Saga, etc.)


class PatternLimits(BaseModel):
    """Operational and structural boundaries for a pattern."""
    supported_consistency: List[str] = Field(
        default=["Strong", "Eventual"],
        description="Allowed consistency models: 'Strong', 'Eventual', 'Causal'"
    )
    min_team_size: int = Field(default=1, description="Minimum recommended engineering team size")
    operational_complexity: int = Field(
        default=2, ge=1, le=5, description="Infrastructure & DevOps overhead (1=trivial, 5=extreme)"
    )
    cost_factor: int = Field(
        default=2, ge=1, le=5, description="Baseline hosting & operational cost (1=minimal, 5=very high)"
    )
    max_scale_rps: Optional[int] = Field(
        None, description="Typical ceiling in requests per second before architectural reconfiguration"
    )


class PatternImpactProfile(BaseModel):
    """ISO 25010 sub-characteristic impact ratings (-2 to +2)."""
    # Performance Efficiency
    Capacity: int = Field(default=0, ge=-2, le=2)
    Time_behavior: int = Field(default=0, ge=-2, le=2, alias="Time behavior")
    Resource_utilization: int = Field(default=0, ge=-2, le=2, alias="Resource utilization")

    # Compatibility
    Interoperability: int = Field(default=0, ge=-2, le=2)
    Co_existence: int = Field(default=0, ge=-2, le=2, alias="Co-existence")

    # Reliability
    Availability: int = Field(default=0, ge=-2, le=2)
    Fault_tolerance: int = Field(default=0, ge=-2, le=2, alias="Fault tolerance")
    Recoverability: int = Field(default=0, ge=-2, le=2)

    # Security
    Confidentiality: int = Field(default=0, ge=-2, le=2)
    Integrity: int = Field(default=0, ge=-2, le=2)

    # Maintainability
    Modularity: int = Field(default=0, ge=-2, le=2)
    Reusability: int = Field(default=0, ge=-2, le=2)
    Analysability: int = Field(default=0, ge=-2, le=2)
    Modifiability: int = Field(default=0, ge=-2, le=2)
    Testability: int = Field(default=0, ge=-2, le=2)

    # Flexibility
    Scalability: int = Field(default=0, ge=-2, le=2)
    Adaptability: int = Field(default=0, ge=-2, le=2)

    class Config:
        populate_by_name = True


class PatternProfile(BaseModel):
    """Complete specification of a curated architectural pattern in the knowledge base."""
    pattern_id: str = Field(..., description="Unique pattern ID, e.g. 'PAT-MODULAR-MONOLITH'")
    name: str = Field(..., description="Official pattern name")
    catalog_source: str = Field(..., description="Authoritative citation (e.g. 'Richards & Ford (2020), Ch. 10')")
    topology_type: TopologyType
    pattern_role: PatternRole = Field(
        default=PatternRole.MACRO_STYLE,
        description="Whether this is a top-level macro architecture or a companion pattern"
    )
    forces_resolved: List[str] = Field(default_factory=list, description="Architectural forces this pattern successfully solves")
    forces_unresolved: List[str] = Field(default_factory=list, description="Known architectural tensions or drawbacks")
    iso25010_impact: Dict[str, int] = Field(
        ...,
        description="Rating from -2 (strongly degrades) to +2 (strongly promotes) for relevant ISO 25010 dimensions"
    )
    limits: PatternLimits = Field(default_factory=PatternLimits)
    applicability_conditions: List[str] = Field(
        default_factory=list,
        description="Scenarios where this pattern is strongly suited"
    )
    anti_requisites: List[str] = Field(
        default_factory=list,
        description="Hard disqualifiers: if an ASR triggers any condition here, pattern is eliminated"
    )
    related_patterns: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Alternatives, companions, or successor patterns"
    )


class TradeoffEvaluation(BaseModel):
    """Result of deterministic ATAM scoring for a single candidate pattern."""
    pattern_id: str
    pattern_name: str
    catalog_source: str
    topology_type: TopologyType
    pattern_role: PatternRole = PatternRole.MACRO_STYLE
    composite_score: float = 0.0
    adjusted_score: float = 0.0
    dimension_breakdown: Dict[str, float] = Field(default_factory=dict)
    disqualified: bool = False
    disqualification_reasons: List[str] = Field(default_factory=list)
    active_tradeoffs: List[str] = Field(
        default_factory=list,
        description="Identified tradeoffs (e.g. 'Promotes Scalability (+2) but Degrades Testability (-2)')"
    )
    recommendation_rank: Optional[int] = None

