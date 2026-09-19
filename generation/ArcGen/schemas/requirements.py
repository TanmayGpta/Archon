"""Requirement schemas grounded in ISO/IEC 25010:2023.

Defines data contracts for raw requirement segmentation, classification,
and normalized SRS representation.
"""

from enum import Enum
from typing import List, Optional, Union
from pydantic import BaseModel, Field, field_validator


class ISO25010Characteristic(str, Enum):
    """The 9 product quality characteristics defined in ISO/IEC 25010:2023."""
    FUNCTIONAL_SUITABILITY = "Functional Suitability"
    PERFORMANCE_EFFICIENCY = "Performance Efficiency"
    COMPATIBILITY = "Compatibility"
    INTERACTION_CAPABILITY = "Interaction Capability"
    RELIABILITY = "Reliability"
    SECURITY = "Security"
    MAINTAINABILITY = "Maintainability"
    FLEXIBILITY = "Flexibility"
    SAFETY = "Safety"


class ISO25010SubCharacteristic(str, Enum):
    """Sub-characteristics relevant to architectural evaluation."""
    # Performance Efficiency
    TIME_BEHAVIOR = "Time behavior"
    RESOURCE_UTILIZATION = "Resource utilization"
    CAPACITY = "Capacity"

    # Compatibility
    INTEROPERABILITY = "Interoperability"
    CO_EXISTENCE = "Co-existence"

    # Reliability
    FAULTLESSNESS = "Faultlessness"
    AVAILABILITY = "Availability"
    FAULT_TOLERANCE = "Fault tolerance"
    RECOVERABILITY = "Recoverability"

    # Security
    CONFIDENTIALITY = "Confidentiality"
    INTEGRITY = "Integrity"
    NON_REPUDIATION = "Non-repudiation"
    ACCOUNTABILITY = "Accountability"
    AUTHENTICITY = "Authenticity"
    RESISTANCE = "Resistance"

    # Maintainability
    MODULARITY = "Modularity"
    REUSABILITY = "Reusability"
    ANALYSABILITY = "Analysability"
    MODIFIABILITY = "Modifiability"
    TESTABILITY = "Testability"

    # Flexibility
    SCALABILITY = "Scalability"
    ADAPTABILITY = "Adaptability"
    INSTALLABILITY = "Installability"
    REPLACEABILITY = "Replaceability"

    # Safety
    FAIL_SAFE = "Fail safe"
    OPERATIONAL_CONSTRAINT = "Operational constraint"


class ArchitectureDriverDimension(str, Enum):
    """Core architectural driver categories used for ASR coverage and stopping rules."""
    THROUGHPUT_SCALE = "Throughput / Scale"
    LATENCY_BUDGET = "Latency Budget"
    DATA_CONSISTENCY = "Data Consistency Model"
    AVAILABILITY_FAULT_TOLERANCE = "Availability / Fault Tolerance"
    SECURITY_COMPLIANCE = "Security / Compliance"
    DEPLOYMENT_TARGET = "Deployment Target"
    COST_CONSTRAINT = "Cost Constraint"


class RequirementType(str, Enum):
    """Classification of requirement scope."""
    FUNCTIONAL = "FR"
    NON_FUNCTIONAL = "NFR"
    ARCHITECTURALLY_SIGNIFICANT = "ASR"
    TECHNICAL_CONSTRAINT = "TC"


class PriorityLevel(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


# Normalization mapping for common synonyms produced by LLMs
ISO_SUB_SYNONYMS = {
    "configurability": ISO25010SubCharacteristic.ADAPTABILITY,
    "standard compliance": ISO25010SubCharacteristic.INTEROPERABILITY,
    "standards compliance": ISO25010SubCharacteristic.INTEROPERABILITY,
    "compliance": ISO25010SubCharacteristic.INTEROPERABILITY,
    "interoperability": ISO25010SubCharacteristic.INTEROPERABILITY,
    "compatibility": ISO25010SubCharacteristic.INTEROPERABILITY,
    "performance": ISO25010SubCharacteristic.TIME_BEHAVIOR,
    "latency": ISO25010SubCharacteristic.TIME_BEHAVIOR,
    "throughput": ISO25010SubCharacteristic.CAPACITY,
    "scale": ISO25010SubCharacteristic.SCALABILITY,
    "security": ISO25010SubCharacteristic.CONFIDENTIALITY,
    "reliability": ISO25010SubCharacteristic.AVAILABILITY,
    "modularity": ISO25010SubCharacteristic.MODULARITY,
    "maintainability": ISO25010SubCharacteristic.MODIFIABILITY,
    "portability": ISO25010SubCharacteristic.ADAPTABILITY,
}


class NormalizedRequirement(BaseModel):
    """A single requirement normalized into a canonical, traceable format."""
    req_id: str = Field(..., description="Canonical identifier (e.g. FR-001, ASR-002, NFR-005)")
    raw_text: str = Field(..., description="Original text fragment from the SRS or user response")
    req_type: RequirementType = Field(..., description="Requirement type tag")
    
    # Classification dimensions
    iso_characteristic: Optional[ISO25010Characteristic] = Field(
        None, description="Primary ISO 25010 quality characteristic"
    )
    iso_sub: Optional[ISO25010SubCharacteristic] = Field(
        None, description="Fine-grained ISO 25010 sub-characteristic"
    )
    arch_dimension: Optional[ArchitectureDriverDimension] = Field(
        None, description="Architectural driver category if this is an ASR"
    )

    # Measurable attributes
    metric: Optional[str] = Field(None, description="Quantifiable metric (e.g., p99 latency, req/sec, availability %)")
    target_value: Optional[Union[float, int, str]] = Field(None, description="Threshold value (e.g., 200, 10000, 99.99)")
    unit: Optional[str] = Field(None, description="Unit of measurement (e.g., ms, req/s, %, USD/mo)")
    comparator: Optional[str] = Field(None, description="Relational operator: '<=', '>=', '=='")
    priority: PriorityLevel = Field(default=PriorityLevel.MEDIUM, description="Architectural weight/priority")
    
    scenario: Optional[str] = Field(
        None, 
        description="SEI-style scenario: Stimulus -> Environment -> Artifact -> Response -> Response Measure"
    )

    @field_validator("iso_sub", mode="before")
    @classmethod
    def normalize_iso_sub(cls, v):
        if v is None:
            return None
        if isinstance(v, ISO25010SubCharacteristic):
            return v
        v_str = str(v).strip()
        v_lower = v_str.lower()
        if v_lower in ISO_SUB_SYNONYMS:
            return ISO_SUB_SYNONYMS[v_lower]
        for sub in ISO25010SubCharacteristic:
            if sub.value.lower() == v_lower:
                return sub
        # Graceful fallback: return None rather than crashing
        return None

    @field_validator("iso_characteristic", mode="before")
    @classmethod
    def normalize_iso_characteristic(cls, v):
        if v is None:
            return None
        if isinstance(v, ISO25010Characteristic):
            return v
        v_str = str(v).strip().lower()
        for char in ISO25010Characteristic:
            if char.value.lower() == v_str:
                return char
        return None

    @field_validator("arch_dimension", mode="before")
    @classmethod
    def normalize_arch_dimension(cls, v):
        if v is None:
            return None
        if isinstance(v, ArchitectureDriverDimension):
            return v
        v_str = str(v).strip().lower()
        for dim in ArchitectureDriverDimension:
            if dim.value.lower() == v_str:
                return dim
        return None


class SRSDocument(BaseModel):
    """Complete, normalized SRS representation ready for Phase B Generation."""
    project_name: str = Field(..., description="Name of the software system")
    domain: str = Field(default="General", description="Application domain (e.g. Fintech, Healthcare, E-Commerce)")
    actors: List[str] = Field(default_factory=list, description="Primary actors interacting with the system")
    external_systems: List[str] = Field(default_factory=list, description="External third-party APIs/services")
    data_objects: List[str] = Field(default_factory=list, description="Core business entities/data objects")
    
    functional_requirements: List[NormalizedRequirement] = Field(default_factory=list)
    non_functional_requirements: List[NormalizedRequirement] = Field(default_factory=list)
    asrs: List[NormalizedRequirement] = Field(default_factory=list)
    technical_constraints: List[NormalizedRequirement] = Field(default_factory=list)

    @property
    def all_requirements(self) -> List[NormalizedRequirement]:
        return (
            self.functional_requirements 
            + self.non_functional_requirements 
            + self.asrs 
            + self.technical_constraints
        )

    def get_requirement(self, req_id: str) -> Optional[NormalizedRequirement]:
        for req in self.all_requirements:
            if req.req_id == req_id:
                return req
        return None
