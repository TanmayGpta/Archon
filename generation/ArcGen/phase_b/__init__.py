"""Phase B package for ArcGen: Requirement-Grounded Architecture Generation.

Contains the deterministic pattern matcher, two-pass generation (nodes, edges),
and edge citation validation.
"""

from .pattern_matcher import match_patterns, format_tradeoff_table
from .normalizer import normalize_srs
from .node_generator import generate_nodes
from .edge_generator import generate_edges
from .edge_validator import validate_architecture, ValidationReport

__all__ = [
    "match_patterns",
    "format_tradeoff_table",
    "normalize_srs",
    "generate_nodes",
    "generate_edges",
    "validate_architecture",
    "ValidationReport",
]
