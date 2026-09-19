"""Unit tests for Phase A ASR tracker and computed stopping rules."""

import unittest
from generation.ArcGen.schemas.requirements import ArchitectureDriverDimension
from generation.ArcGen.phase_a.asr_tracker import (
    ASRTracker,
    COVERAGE_STOPPING_THRESHOLD,
    DEFAULT_ASR_WEIGHTS,
)


class TestASRTracker(unittest.TestCase):
    def setUp(self):
        self.tracker = ASRTracker()

    def test_initial_state(self):
        self.assertEqual(self.tracker.coverage_ratio, 0.0)
        self.assertEqual(len(self.tracker.unfilled_categories()), 7)
        # Highest weight categories should be first
        first_unfilled = self.tracker.unfilled_categories()[0]
        self.assertIn(
            first_unfilled,
            [
                ArchitectureDriverDimension.THROUGHPUT_SCALE,
                ArchitectureDriverDimension.LATENCY_BUDGET,
                ArchitectureDriverDimension.DATA_CONSISTENCY,
            ],
        )

    def test_slot_recording_increases_coverage(self):
        self.tracker.record_slot(
            dimension=ArchitectureDriverDimension.THROUGHPUT_SCALE,
            raw_text="10,000 req/sec",
            metric="throughput",
            value="10000",
            unit="req/s",
        )
        expected = 5.0 / 28.0  # 5 weight out of 28 total
        self.assertAlmostEqual(self.tracker.coverage_ratio, expected)

    def test_stopping_criterion_at_85_percent_coverage(self):
        # Fill 24 weight out of 28 -> 85.7% coverage >= 85%
        self.tracker.record_slot(
            ArchitectureDriverDimension.THROUGHPUT_SCALE, "10k rps"
        )  # 5
        self.tracker.record_slot(
            ArchitectureDriverDimension.LATENCY_BUDGET, "50ms"
        )  # 5
        self.tracker.record_slot(
            ArchitectureDriverDimension.DATA_CONSISTENCY, "Strong ACID"
        )  # 5
        self.tracker.record_slot(
            ArchitectureDriverDimension.AVAILABILITY_FAULT_TOLERANCE, "99.99%"
        )  # 4
        self.tracker.record_slot(
            ArchitectureDriverDimension.SECURITY_COMPLIANCE, "OAuth2"
        )  # 3
        self.tracker.record_slot(
            ArchitectureDriverDimension.DEPLOYMENT_TARGET, "AWS EKS"
        )  # 3
        # Total filled = 25 / 28 = 89.2%

        should_stop, reason = self.tracker.record_round_completion()
        self.assertTrue(should_stop)
        self.assertIn("Coverage threshold achieved", reason)

    def test_stopping_criterion_on_information_stagnation(self):
        # Round 1: provide info
        self.tracker.record_slot(ArchitectureDriverDimension.THROUGHPUT_SCALE, "1k rps")
        should_stop, _ = self.tracker.record_round_completion()
        self.assertFalse(should_stop)

        # Round 2: user says "don't know", no new slots filled
        should_stop, _ = self.tracker.record_round_completion()
        self.assertFalse(should_stop)

        # Round 3: user says "don't know" again (2 stagnant rounds, 3 turns)
        should_stop, reason = self.tracker.record_round_completion()
        self.assertTrue(should_stop)
        self.assertIn("Information plateau reached", reason)

    def test_max_turns_safety_cap(self):
        # 6 turns without reaching 85% should stop on fatigue cap
        for _ in range(6):
            # Give tiny increment to avoid stagnation rule triggering first
            self.tracker.coverage_history.append(0.1)
            self.tracker.turn_count += 1

        self.tracker.turn_count = 5
        should_stop, reason = self.tracker.record_round_completion()
        self.assertTrue(should_stop)
        self.assertIn("Maximum question budget reached", reason)


if __name__ == "__main__":
    unittest.main()
