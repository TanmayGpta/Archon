"""Unit tests for ArcGen schemas."""

import unittest
from generation.ArcGen.schemas import (
    ISO25010Characteristic,
    ISO25010SubCharacteristic,
    ArchitectureDriverDimension,
    RequirementType,
    NormalizedRequirement,
    SRSDocument,
    ArchNode,
    ArchEdge,
    ArchitectureGraph,
    PatternProfile,
    TradeoffEvaluation,
)
from generation.ArcGen.schemas.architecture import NodeType, EdgeType
from generation.ArcGen.schemas.patterns import TopologyType, PatternLimits


class TestRequirementsSchema(unittest.TestCase):
    def test_normalized_requirement_creation(self):
        req = NormalizedRequirement(
            req_id="ASR-001",
            raw_text="The system must support 10,000 req/s with p99 < 50ms",
            req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
            iso_characteristic=ISO25010Characteristic.PERFORMANCE_EFFICIENCY,
            iso_sub=ISO25010SubCharacteristic.TIME_BEHAVIOR,
            arch_dimension=ArchitectureDriverDimension.LATENCY_BUDGET,
            metric="p99 latency",
            target_value=50,
            unit="ms",
            comparator="<=",
        )
        self.assertEqual(req.req_id, "ASR-001")
        self.assertEqual(req.iso_sub, ISO25010SubCharacteristic.TIME_BEHAVIOR)
        self.assertEqual(req.target_value, 50)

    def test_srs_document(self):
        srs = SRSDocument(
            project_name="OrderEngine",
            domain="E-Commerce",
            actors=["Customer", "Admin"],
            functional_requirements=[
                NormalizedRequirement(
                    req_id="FR-001",
                    raw_text="User can place orders",
                    req_type=RequirementType.FUNCTIONAL,
                )
            ],
            asrs=[
                NormalizedRequirement(
                    req_id="ASR-001",
                    raw_text="Zero downtime deployment required",
                    req_type=RequirementType.ARCHITECTURALLY_SIGNIFICANT,
                    arch_dimension=ArchitectureDriverDimension.AVAILABILITY_FAULT_TOLERANCE,
                )
            ],
        )
        self.assertEqual(len(srs.all_requirements), 2)
        self.assertIsNotNone(srs.get_requirement("FR-001"))
        self.assertIsNone(srs.get_requirement("FR-999"))


class TestArchitectureSchema(unittest.TestCase):
    def test_valid_architecture_graph(self):
        node1 = ArchNode(
            node_id="COMP-001",
            name="OrderService",
            node_type=NodeType.SERVICE,
            layer="Application",
            description="Handles order lifecycle",
            traced_requirements=["FR-001"],
            kb_citations=["PAT-MICROSERVICES"],
        )
        node2 = ArchNode(
            node_id="COMP-002",
            name="OrderDB",
            node_type=NodeType.DATASTORE,
            layer="Infrastructure",
            description="Primary PostgreSQL database for orders",
            traced_requirements=["FR-001"],
            kb_citations=["PAT-DATABASE-PER-SERVICE"],
        )
        edge = ArchEdge(
            edge_id="EDGE-001",
            source="COMP-001",
            target="COMP-002",
            edge_type=EdgeType.DB_WRITE,
            protocol="PostgreSQL wire protocol",
            traced_requirements=["FR-001"],
            kb_citations=["PAT-DATABASE-PER-SERVICE"],
            justification="OrderService persists confirmed orders to OrderDB",
        )

        graph = ArchitectureGraph(
            project_name="OrderEngine",
            style="Microservices",
            nodes=[node1, node2],
            edges=[edge],
        )

        self.assertEqual(len(graph.nodes), 2)
        self.assertEqual(len(graph.edges), 1)
        self.assertEqual(len(graph.orphan_nodes), 0)
        self.assertEqual(graph.orphan_ratio, 0.0)

        # PlantUML generation check
        puml = graph.to_plantuml()
        self.assertIn("@startuml", puml)
        self.assertIn("COMP-001 --> COMP-002", puml)
        self.assertIn("@enduml", puml)

    def test_invalid_edge_references_raise_value_error(self):
        node = ArchNode(
            node_id="COMP-001",
            name="OrderService",
            node_type=NodeType.SERVICE,
            description="Order handler",
            traced_requirements=["FR-001"],
        )
        invalid_edge = ArchEdge(
            edge_id="EDGE-001",
            source="COMP-001",
            target="NON_EXISTENT_NODE",
            edge_type=EdgeType.SYNC_REST,
            traced_requirements=["FR-001"],
            justification="Invalid dependency",
        )
        with self.assertRaises(ValueError):
            ArchitectureGraph(
                project_name="BrokenApp",
                style="Microservices",
                nodes=[node],
                edges=[invalid_edge],
            )

    def test_orphan_node_detection(self):
        node1 = ArchNode(
            node_id="COMP-001",
            name="ConnectedA",
            node_type=NodeType.SERVICE,
            description="Service A",
            traced_requirements=["FR-001"],
        )
        node2 = ArchNode(
            node_id="COMP-002",
            name="ConnectedB",
            node_type=NodeType.SERVICE,
            description="Service B",
            traced_requirements=["FR-001"],
        )
        orphan = ArchNode(
            node_id="COMP-003",
            name="DisconnectedC",
            node_type=NodeType.SERVICE,
            description="Service C with no edges",
            traced_requirements=["FR-002"],
        )
        edge = ArchEdge(
            edge_id="EDGE-001",
            source="COMP-001",
            target="COMP-002",
            edge_type=EdgeType.SYNC_REST,
            traced_requirements=["FR-001"],
            justification="Service A calls Service B",
        )

        graph = ArchitectureGraph(
            project_name="PartialApp",
            style="Microservices",
            nodes=[node1, node2, orphan],
            edges=[edge],
        )

        self.assertEqual(graph.orphan_nodes, ["COMP-003"])
        self.assertAlmostEqual(graph.orphan_ratio, 1 / 3)


class TestPatternSchema(unittest.TestCase):
    def test_pattern_profile(self):
        profile = PatternProfile(
            pattern_id="PAT-MODULAR-MONOLITH",
            name="Modular Monolith",
            catalog_source="Richards & Ford (2020), Ch. 10",
            topology_type=TopologyType.MONOLITHIC,
            forces_resolved=["Simplicity", "Strong data consistency", "Low hosting cost"],
            forces_unresolved=["Deployment coupling", "Shared runtime bottlenecks"],
            iso25010_impact={
                "Capacity": 0,
                "Time behavior": 1,
                "Availability": 0,
                "Integrity": 2,
                "Modularity": 2,
                "Testability": 2,
                "Scalability": -1,
            },
            limits=PatternLimits(
                supported_consistency=["Strong"],
                min_team_size=1,
                operational_complexity=2,
                cost_factor=1,
            ),
            applicability_conditions=["Small to medium team", "Strong consistency required"],
            anti_requisites=["Independent team deployments required", "Extreme scale > 100k rps"],
        )
        self.assertEqual(profile.pattern_id, "PAT-MODULAR-MONOLITH")
        self.assertEqual(profile.topology_type, TopologyType.MONOLITHIC)
        self.assertIn("Modularity", profile.iso25010_impact)


if __name__ == "__main__":
    unittest.main()
