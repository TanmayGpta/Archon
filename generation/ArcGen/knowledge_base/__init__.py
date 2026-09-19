"""Knowledge Base package for ArcGen.

Contains curated architectural patterns, tactics, and the deterministic catalog loader.
"""

from .loader import PatternCatalog, get_catalog

__all__ = ["PatternCatalog", "get_catalog"]
