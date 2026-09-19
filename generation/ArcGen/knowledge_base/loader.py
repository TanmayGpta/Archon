"""Deterministic loader for the curated architectural knowledge base.

Loads, validates, and indexes architectural pattern profiles from JSON catalog files.
Zero LLM or embedding involvement — purely deterministic data access.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional
from generation.ArcGen.schemas.patterns import PatternProfile, TopologyType


class PatternCatalog:
    """In-memory registry of curated architectural patterns."""

    def __init__(self, patterns_dir: Optional[Path] = None):
        if patterns_dir is None:
            self.patterns_dir = Path(__file__).parent / "patterns"
        else:
            self.patterns_dir = Path(patterns_dir)

        self._patterns: Dict[str, PatternProfile] = {}
        self._load_catalog()

    def _load_catalog(self):
        """Scans patterns directory and loads all validated JSON files."""
        if not self.patterns_dir.exists():
            return

        for file_path in self.patterns_dir.glob("*.json"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                profile = PatternProfile.model_validate(data)
                self._patterns[profile.pattern_id] = profile
            except Exception as e:
                raise ValueError(f"Failed to load pattern file {file_path.name}: {e}") from e

    def get(self, pattern_id: str) -> Optional[PatternProfile]:
        """Lookup a pattern by unique identifier."""
        return self._patterns.get(pattern_id)

    def list_all(self) -> List[PatternProfile]:
        """Return all loaded pattern profiles."""
        return list(self._patterns.values())

    def filter_by_topology(self, topology: TopologyType) -> List[PatternProfile]:
        """Filter patterns by topology type (Monolithic, Distributed, Hybrid)."""
        return [p for p in self._patterns.values() if p.topology_type == topology]

    def count(self) -> int:
        return len(self._patterns)


_GLOBAL_CATALOG: Optional[PatternCatalog] = None


def get_catalog(reload: bool = False) -> PatternCatalog:
    """Singleton getter for the pattern knowledge base catalog."""
    global _GLOBAL_CATALOG
    if _GLOBAL_CATALOG is None or reload:
        _GLOBAL_CATALOG = PatternCatalog()
    return _GLOBAL_CATALOG
