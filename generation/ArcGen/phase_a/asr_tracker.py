"""Architecturally Significant Requirement (ASR) Coverage Tracker.

Implements the computed mathematical stopping criterion for Phase A Elicitation.
Tracks slot-filling across the 7 core architectural driver dimensions.
"""

from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field
from generation.ArcGen.schemas.requirements import ArchitectureDriverDimension


# Default category weights based on architectural decision significance
DEFAULT_ASR_WEIGHTS: Dict[ArchitectureDriverDimension, float] = {
    ArchitectureDriverDimension.THROUGHPUT_SCALE: 5.0,
    ArchitectureDriverDimension.LATENCY_BUDGET: 5.0,
    ArchitectureDriverDimension.DATA_CONSISTENCY: 5.0,
    ArchitectureDriverDimension.AVAILABILITY_FAULT_TOLERANCE: 4.0,
    ArchitectureDriverDimension.SECURITY_COMPLIANCE: 3.0,
    ArchitectureDriverDimension.DEPLOYMENT_TARGET: 3.0,
    ArchitectureDriverDimension.COST_CONSTRAINT: 3.0,
}

COVERAGE_STOPPING_THRESHOLD = 0.85  # 85% coverage threshold
MARGINAL_GAIN_EPSILON = 0.04        # Less than 4% gain constitutes stagnation
MAX_INTERVIEW_TURNS = 6             # Safety cap against interrogation fatigue


class CategoryState(BaseModel):
    dimension: ArchitectureDriverDimension
    weight: float
    filled: bool = False
    raw_response: Optional[str] = None
    metric: Optional[str] = None
    value: Optional[str] = None
    unit: Optional[str] = None


class ASRTracker:
    """Mathematical tracker monitoring ASR completeness and marginal information gain."""

    def __init__(
        self,
        weights: Optional[Dict[ArchitectureDriverDimension, float]] = None,
        stopping_threshold: float = COVERAGE_STOPPING_THRESHOLD,
    ):
        self.weights = weights or DEFAULT_ASR_WEIGHTS
        self.total_weight = sum(self.weights.values())
        self.stopping_threshold = stopping_threshold

        self.slots: Dict[ArchitectureDriverDimension, CategoryState] = {
            dim: CategoryState(dimension=dim, weight=w)
            for dim, w in self.weights.items()
        }
        self.coverage_history: List[float] = [0.0]
        self.stagnant_rounds: int = 0
        self.turn_count: int = 0

    @property
    def coverage_ratio(self) -> float:
        """Calculates current weighted ASR coverage (0.0 to 1.0)."""
        filled_weight = sum(
            slot.weight for slot in self.slots.values() if slot.filled
        )
        return filled_weight / self.total_weight if self.total_weight > 0 else 0.0

    @property
    def coverage_percentage(self) -> float:
        return self.coverage_ratio * 100.0

    def unfilled_categories(self) -> List[ArchitectureDriverDimension]:
        """Returns unfilled categories sorted by weight descending (highest architectural priority first)."""
        unfilled = [slot for slot in self.slots.values() if not slot.filled]
        unfilled.sort(key=lambda s: s.weight, reverse=True)
        return [s.dimension for s in unfilled]

    def record_slot(
        self,
        dimension: ArchitectureDriverDimension,
        raw_text: str,
        metric: Optional[str] = None,
        value: Optional[str] = None,
        unit: Optional[str] = None,
    ):
        """Fills an architectural slot with user-provided or extracted information."""
        if dimension in self.slots:
            slot = self.slots[dimension]
            slot.filled = True
            slot.raw_response = raw_text
            slot.metric = metric
            slot.value = value
            slot.unit = unit

    def record_round_completion(self) -> Tuple[bool, str]:
        """Records end of a dialogue turn and determines whether to stop elicitation.
        
        Returns:
            (should_stop, stopping_reason)
        """
        self.turn_count += 1
        current_cov = self.coverage_ratio
        prev_cov = self.coverage_history[-1] if self.coverage_history else 0.0

        marginal_gain = current_cov - prev_cov
        self.coverage_history.append(current_cov)

        if marginal_gain < MARGINAL_GAIN_EPSILON:
            self.stagnant_rounds += 1
        else:
            self.stagnant_rounds = 0

        # Criterion 1: Target coverage achieved
        if current_cov >= self.stopping_threshold:
            return True, f"ASR Coverage threshold achieved: {current_cov:.1%} >= {self.stopping_threshold:.1%}"

        # Criterion 2: Marginal gain plateau / stagnation (user unable to provide new info)
        if self.stagnant_rounds >= 2 and self.turn_count >= 3:
            return True, f"Information plateau reached: marginal gain < {MARGINAL_GAIN_EPSILON:.1%} for 2 rounds"

        # Criterion 3: Interrogation fatigue safety cap
        if self.turn_count >= MAX_INTERVIEW_TURNS:
            return True, f"Maximum question budget reached ({MAX_INTERVIEW_TURNS} turns) to avoid user fatigue"

        return False, f"Continue elicitation: current coverage is {current_cov:.1%}"

    def get_summary(self) -> Dict[str, Any]:
        """Returns serialized summary of elicitation progress."""
        return {
            "turn_count": self.turn_count,
            "coverage_ratio": self.coverage_ratio,
            "coverage_percentage": self.coverage_percentage,
            "filled_count": sum(1 for s in self.slots.values() if s.filled),
            "total_slots": len(self.slots),
            "slots": {
                dim.value: {
                    "filled": slot.filled,
                    "weight": slot.weight,
                    "value": slot.value or slot.raw_response,
                }
                for dim, slot in self.slots.items()
            },
        }
