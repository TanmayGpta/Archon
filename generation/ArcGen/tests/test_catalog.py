"""Unit tests for the curated pattern knowledge base catalog."""

import unittest
from pathlib import Path
from generation.ArcGen.knowledge_base.loader import PatternCatalog, get_catalog
from generation.ArcGen.schemas.patterns import TopologyType


class TestPatternCatalog(unittest.TestCase):
    def setUp(self):
        self.catalog = get_catalog()

    def test_catalog_loads_20_patterns(self):
        self.assertEqual(self.catalog.count(), 20)

    def test_get_pattern_by_id(self):
        p = self.catalog.get("PAT-MICROSERVICES")
        self.assertIsNotNone(p)
        self.assertEqual(p.name, "Microservices Architecture")
        self.assertEqual(p.topology_type, TopologyType.DISTRIBUTED)
        self.assertGreater(len(p.anti_requisites), 0)
        self.assertIn("Capacity", p.iso25010_impact)

    def test_filter_by_topology(self):
        monoliths = self.catalog.filter_by_topology(TopologyType.MONOLITHIC)
        self.assertGreater(len(monoliths), 0)
        for m in monoliths:
            self.assertEqual(m.topology_type, TopologyType.MONOLITHIC)

        distributed = self.catalog.filter_by_topology(TopologyType.DISTRIBUTED)
        self.assertGreater(len(distributed), 0)
        for d in distributed:
            self.assertEqual(d.topology_type, TopologyType.DISTRIBUTED)

    def test_nonexistent_pattern_returns_none(self):
        self.assertIsNone(self.catalog.get("PAT-DOES-NOT-EXIST"))


if __name__ == "__main__":
    unittest.main()
