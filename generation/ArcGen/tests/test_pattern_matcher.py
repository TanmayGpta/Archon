"""Unit tests for the deterministic ATAM pattern matcher."""

import unittest
from generation.ArcGen.schemas.requirements import (
    SRSDocument,
    NormalizedRequirement,
    RequirementType,
    PriorityLevel,
    ArchitectureDriverDimension,
    ISO25010Characteristic,
    ISO25010SubCharacteristic,
)
from generation.ArcGen.phase_b.pattern_matcher import match_patterns, format_tradeoff_table


class TestPatternMatcher(unittest.TestCase):
    def test_strong_acid_disqualifies_eventual_patterns(self):
        srs = SRSDocument(
            project_name="LedgerSystem",
            domain="Banking",
            asrs=[
                NormalizedRequirement(
                    req_id="ASR-001",
                    raw_text="The system must enforce strong ACID transaction consistency across accounts",
                    req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                    arch_dimension=ArchitectureDriverDimension.DATA_CONSISTENCY,
                    priority=PriorityLevel.CRITICAL,
                )
            ],
        )

        evals = match_patterns(srs)
        eval_map = {e.pattern_id: e for e in evals}

        # EDA Broker and Space-Based only support Eventual consistency -> must be disqualified
        self.assertTrue(eval_map["PAT-EDA-BROKER"].disqualified)
        self.assertIn("Requires Strong ACID consistency", eval_map["PAT-EDA-BROKER"].disqualification_reasons[0])

        # Modular Monolith and Layered support Strong consistency -> must NOT be disqualified
        self.assertFalse(eval_map["PAT-MODULAR-MONOLITH"].disqualified)
        self.assertFalse(eval_map["PAT-LAYERED"].disqualified)

    def test_extreme_scale_disqualifies_low_ceiling_patterns(self):
        srs = SRSDocument(
            project_name="HighScaleApp",
            domain="Social Media",
            asrs=[
                NormalizedRequirement(
                    req_id="ASR-001",
                    raw_text="System must sustain 50,000 requests per second peak throughput",
                    req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                    arch_dimension=ArchitectureDriverDimension.THROUGHPUT_SCALE,
                    metric="peak throughput",
                    target_value=50000,
                    unit="req/s",
                    priority=PriorityLevel.CRITICAL,
                )
            ],
        )

        evals = match_patterns(srs)
        eval_map = {e.pattern_id: e for e in evals}

        # Layered architecture has 5,000 rps ceiling -> must be disqualified
        self.assertTrue(eval_map["PAT-LAYERED"].disqualified)
        self.assertIn("exceeds Layered (N-Tier) Architecture ceiling", eval_map["PAT-LAYERED"].disqualification_reasons[0])

    def test_tradeoff_table_generation(self):
        srs = SRSDocument(
            project_name="ShopEngine",
            domain="E-Commerce",
            asrs=[
                NormalizedRequirement(
                    req_id="ASR-001",
                    raw_text="Sub-50ms p99 response time",
                    req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                    arch_dimension=ArchitectureDriverDimension.LATENCY_BUDGET,
                    iso_sub=ISO25010SubCharacteristic.TIME_BEHAVIOR,
                    priority=PriorityLevel.HIGH,
                ),
                NormalizedRequirement(
                    req_id="ASR-002",
                    raw_text="Horizontal scaling to 30,000 req/s",
                    req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                    arch_dimension=ArchitectureDriverDimension.THROUGHPUT_SCALE,
                    iso_sub=ISO25010SubCharacteristic.CAPACITY,
                    priority=PriorityLevel.HIGH,
                ),
            ],
        )

        evals = match_patterns(srs)
        self.assertGreater(len(evals), 0)

        # Ensure top non-disqualified pattern has Rank 1
        active = [e for e in evals if not e.disqualified]
        self.assertGreater(len(active), 0)
        self.assertEqual(active[0].recommendation_rank, 1)

        # Check markdown table output
        table_md = format_tradeoff_table(evals, srs, top_k=3)
        self.assertIn("| Requirement / Driver |", table_md)
        self.assertIn("COMPOSITE SCORE", table_md)
        self.assertIn("Rank 1", table_md)

    def test_occam_tie_breaking_and_role_separation(self):
        from generation.ArcGen.schemas.patterns import PatternRole
        srs = SRSDocument(
            project_name="StandardApp",
            asrs=[
                NormalizedRequirement(
                    req_id="ASR-001",
                    raw_text="High scalability required",
                    req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                    iso_sub=ISO25010SubCharacteristic.SCALABILITY,
                    priority=PriorityLevel.HIGH,
                )
            ],
        )

        evals = match_patterns(srs)
        macros = [e for e in evals if e.pattern_role == PatternRole.MACRO_STYLE]
        companions = [e for e in evals if e.pattern_role == PatternRole.COMPANION]

        self.assertGreater(len(macros), 0)
        self.assertGreater(len(companions), 0)

        # Rank 1 must be a MacroStyle (e.g. EDA, Microservices, or Monolith)
        rank1 = next(e for e in macros if e.recommendation_rank == 1)
        self.assertEqual(rank1.pattern_role, PatternRole.MACRO_STYLE)

        # Ensure adjusted_score incorporates complexity penalty
        for e in evals:
            self.assertLessEqual(e.adjusted_score, e.composite_score)


if __name__ == "__main__":
    unittest.main()

