"""Unit tests for edge and citation validator."""

import unittest
from generation.ArcGen.schemas.requirements import (
    SRSDocument,
    NormalizedRequirement,
    RequirementType,
)
from generation.ArcGen.schemas.architecture import (
    ArchNode,
    ArchEdge,
    NodeType,
    EdgeType,
)
from generation.ArcGen.phase_b.edge_validator import validate_architecture


class TestEdgeValidator(unittest.TestCase):
    def setUp(self):
        self.srs = SRSDocument(
            project_name="TestApp",
            functional_requirements=[
                NormalizedRequirement(
                    req_id="FR-001",
                    raw_text="User login",
                    req_type=RequirementType.FUNCTIONAL,
                ),
                NormalizedRequirement(
                    req_id="FR-002",
                    raw_text="Process payment",
                    req_type=RequirementType.FUNCTIONAL,
                ),
            ],
            asrs=[
                NormalizedRequirement(
                    req_id="ASR-001",
                    raw_text="High availability",
                    req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                )
            ],
        )

        self.node1 = ArchNode(
            node_id="COMP-001",
            name="Gateway",
            node_type=NodeType.GATEWAY,
            description="API Gateway",
            traced_requirements=["FR-001"],
            kb_citations=["PAT-API-GATEWAY"],
        )
        self.node2 = ArchNode(
            node_id="COMP-002",
            name="AuthService",
            node_type=NodeType.SERVICE,
            description="Auth handler",
            traced_requirements=["FR-001"],
            kb_citations=["PAT-MICROSERVICES"],
        )
        self.node3 = ArchNode(
            node_id="COMP-003",
            name="PaymentService",
            node_type=NodeType.SERVICE,
            description="Payment handler",
            traced_requirements=["FR-002"],
            kb_citations=["PAT-MICROSERVICES"],
        )

    def test_valid_edges_pass(self):
        edge = ArchEdge(
            edge_id="EDGE-001",
            source="COMP-001",
            target="COMP-002",
            edge_type=EdgeType.SYNC_REST,
            traced_requirements=["FR-001"],
            kb_citations=["PAT-MICROSERVICES"],
            justification="Gateway forwards auth request to AuthService",
        )

        valid_edges, report = validate_architecture(
            [self.node1, self.node2], [edge], self.srs
        )
        self.assertEqual(len(valid_edges), 1)
        self.assertEqual(report.rejected_edges_count, 0)
        self.assertEqual(len(report.orphan_nodes), 0)

    def test_invalid_endpoint_is_rejected(self):
        bad_edge = ArchEdge(
            edge_id="EDGE-999",
            source="COMP-001",
            target="COMP-GHOST",
            edge_type=EdgeType.SYNC_REST,
            traced_requirements=["FR-001"],
            kb_citations=["PAT-MICROSERVICES"],
            justification="Invalid link",
        )

        valid_edges, report = validate_architecture(
            [self.node1, self.node2], [bad_edge], self.srs
        )
        self.assertEqual(len(valid_edges), 0)
        self.assertEqual(report.rejected_edges_count, 1)
        self.assertIn("Invalid endpoint", report.rejected_reasons[0])

    def test_uncited_edge_is_rejected(self):
        uncited_edge = ArchEdge(
            edge_id="EDGE-002",
            source="COMP-001",
            target="COMP-002",
            edge_type=EdgeType.SYNC_REST,
            traced_requirements=["NON-EXISTENT-REQ-999"],
            kb_citations=["PAT-MICROSERVICES"],
            justification="Uncited link",
        )

        valid_edges, report = validate_architecture(
            [self.node1, self.node2], [uncited_edge], self.srs
        )
        self.assertEqual(len(valid_edges), 0)
        self.assertEqual(report.rejected_edges_count, 1)
        self.assertIn("Missing valid requirement citation", report.rejected_reasons[0])

    def test_orphan_node_detection_and_coverage(self):
        edge = ArchEdge(
            edge_id="EDGE-001",
            source="COMP-001",
            target="COMP-002",
            edge_type=EdgeType.SYNC_REST,
            traced_requirements=["FR-001"],
            kb_citations=["PAT-MICROSERVICES"],
            justification="Auth routing",
        )

        # Node 3 is not connected to any edge
        valid_edges, report = validate_architecture(
            [self.node1, self.node2, self.node3], [edge], self.srs
        )
        self.assertEqual(report.orphan_nodes, ["COMP-003"])
        self.assertAlmostEqual(report.orphan_ratio, 1 / 3)
        # FR-001 is covered by edge+nodes, FR-002 is covered by node3
        self.assertIn("FR-001", report.covered_requirement_ids)
        self.assertIn("FR-002", report.covered_requirement_ids)


if __name__ == "__main__":
    unittest.main()
