"""Test simulating Phase A elicitation workflow without blocking on manual input."""

import unittest
from generation.ArcGen.schemas.requirements import ArchitectureDriverDimension
from generation.ArcGen.phase_a.asr_tracker import ASRTracker
from generation.ArcGen.schemas.elicitation import QuestionItem


class TestPhaseAElicitationFlow(unittest.TestCase):
    def test_simulated_elicitation_dialogue_reaches_stopping_point(self):
        tracker = ASRTracker()

        # Initial vague prompt provides no concrete ASR constraints
        self.assertEqual(tracker.coverage_percentage, 0.0)

        # Turn 1: User answers throughput question
        tracker.record_slot(
            dimension=ArchitectureDriverDimension.THROUGHPUT_SCALE,
            raw_text="50,000 events/sec",
            metric="throughput",
            value="50000",
            unit="events/s",
        )
        should_stop, _ = tracker.record_round_completion()
        self.assertFalse(should_stop)
        self.assertGreater(tracker.coverage_percentage, 15.0)

        # Turn 2: User answers latency question
        tracker.record_slot(
            dimension=ArchitectureDriverDimension.LATENCY_BUDGET,
            raw_text="p99 response time under 30ms",
            metric="p99 latency",
            value="30",
            unit="ms",
        )
        should_stop, _ = tracker.record_round_completion()
        self.assertFalse(should_stop)

        # Turn 3: User answers data consistency
        tracker.record_slot(
            dimension=ArchitectureDriverDimension.DATA_CONSISTENCY,
            raw_text="Eventual consistency for telemetry, ACID for payments",
            metric="consistency model",
            value="Eventual",
        )
        should_stop, _ = tracker.record_round_completion()
        self.assertFalse(should_stop)

        # Turn 4: User answers availability & deployment
        tracker.record_slot(
            dimension=ArchitectureDriverDimension.AVAILABILITY_FAULT_TOLERANCE,
            raw_text="99.99% uptime with multi-region failover",
            metric="uptime SLA",
            value="99.99",
            unit="%",
        )
        tracker.record_slot(
            dimension=ArchitectureDriverDimension.DEPLOYMENT_TARGET,
            raw_text="Kubernetes on Google Cloud Platform (GKE)",
            value="GKE",
        )
        tracker.record_slot(
            dimension=ArchitectureDriverDimension.SECURITY_COMPLIANCE,
            raw_text="mTLS and JWT token authorization",
            value="mTLS",
        )

        # At this point, 25 out of 28 weight points are filled (89.3% >= 85%)
        should_stop, reason = tracker.record_round_completion()
        self.assertTrue(should_stop)
        self.assertIn("Coverage threshold achieved", reason)
        self.assertGreaterEqual(tracker.coverage_ratio, 0.85)


if __name__ == "__main__":
    unittest.main()
