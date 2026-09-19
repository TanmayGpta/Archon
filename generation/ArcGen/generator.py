"""ArcGen Phase B Architecture Generation Pipeline.

Orchestrates:
1. Requirement Normalization (Groq / Ollama)
2. Deterministic ATAM Pattern Matching (Pure math / KB)
3. Pass 1: Node Generation with requirement & KB citations
4. Pass 2: Edge Generation with explicit data-flow tracing
5. Edge and Citation Validation (Sanitization & Diagnostics)
6. PlantUML & Mermaid Rendering, Tradeoff Table Generation
"""

import logging
import time
from typing import Optional, Tuple
from generation.ArcGen.schemas.requirements import SRSDocument
from generation.ArcGen.schemas.architecture import ArchitectureGraph
from generation.ArcGen.phase_b.normalizer import normalize_srs
from generation.ArcGen.phase_b.pattern_matcher import match_patterns, format_tradeoff_table
from generation.ArcGen.phase_b.node_generator import generate_nodes
from generation.ArcGen.phase_b.edge_generator import generate_edges
from generation.ArcGen.phase_b.edge_validator import validate_architecture, ValidationReport
from generation.ArcGen.knowledge_base.loader import get_catalog
from generation.ArcGen.llm import BaseLLMClient, get_llm_client

logger = logging.getLogger(__name__)


def generate_architecture_from_srs(
    raw_srs_text: Optional[str] = None,
    project_name: Optional[str] = None,
    client: Optional[BaseLLMClient] = None,
    srs_document: Optional[SRSDocument] = None,
) -> Tuple[ArchitectureGraph, str, ValidationReport, SRSDocument]:
    """End-to-end execution of the requirement-grounded architecture generation pipeline."""
    if client is None:
        client = get_llm_client()

    provider_name = type(client).__name__
    model_name = getattr(client, "model", "default")
    print(f"\n[ArcGen Pipeline] Active LLM: {provider_name} ({model_name})")

    catalog = get_catalog()
    t_start = time.time()

    # Step 1: Normalize requirements (or use pre-synthesized document from Phase A)
    if srs_document is not None:
        srs = srs_document
        print(f" -> [1/4] Requirements: Using pre-synthesized document ({len(srs.asrs)} ASRs, {len(srs.all_requirements)} total)")
    else:
        print(" -> [1/4] Normalizing requirements from input text...")
        t0 = time.time()
        srs = normalize_srs(raw_srs_text or "", project_name=project_name, client=client)
        print(f"        Done in {time.time() - t0:.2f}s ({len(srs.asrs)} ASRs, {len(srs.all_requirements)} total)")

    # Step 2: Deterministic ATAM Pattern Matching
    print(" -> [2/4] Executing deterministic ATAM pattern matching (Pure math / KB)...")
    t0 = time.time()
    evaluations = match_patterns(srs, catalog=catalog)

    # Select Rank 1 Macro Style pattern (system skeleton)
    from generation.ArcGen.schemas.patterns import PatternRole
    macro_evals = [e for e in evaluations if e.pattern_role == PatternRole.MACRO_STYLE and not e.disqualified]
    if not macro_evals:
        primary_pattern = catalog.get("PAT-MODULAR-MONOLITH")
    else:
        primary_pattern = catalog.get(macro_evals[0].pattern_id)

    # Identify top scored companion patterns (e.g. API Gateway, BFF, Database per Service)
    companion_evals = [e for e in evaluations if e.pattern_role == PatternRole.COMPANION and not e.disqualified][:3]
    companion_patterns = [catalog.get(e.pattern_id) for e in companion_evals if catalog.get(e.pattern_id)]
    print(f"        Selected Macro Style: {primary_pattern.name} ({primary_pattern.pattern_id}) in {time.time() - t0:.2f}s")
    if companion_patterns:
        print(f"        Selected Companions:  {', '.join([c.name for c in companion_patterns])}")

    # Step 3: Pass 1 Node Generation
    print(f" -> [3/4] Pass 1: Generating components grounded in {primary_pattern.name}...")
    t0 = time.time()
    nodes = generate_nodes(
        srs=srs,
        primary_pattern=primary_pattern,
        companion_patterns=companion_patterns,
        client=client,
    )
    print(f"        Synthesized {len(nodes)} components in {time.time() - t0:.2f}s")

    # Step 4: Pass 2 Edge Generation
    print(" -> [4/4] Pass 2: Synthesizing dependencies, data flows & protocols...")
    t0 = time.time()
    raw_edges = generate_edges(
        nodes=nodes,
        srs=srs,
        primary_pattern=primary_pattern,
        client=client,
    )
    print(f"        Synthesized {len(raw_edges)} relations in {time.time() - t0:.2f}s")

    # Step 5: Citation & Graph Validation
    valid_edges, report = validate_architecture(nodes=nodes, edges=raw_edges, srs=srs)

    # Step 6: Generate Tradeoff Table
    tradeoff_table = format_tradeoff_table(evaluations, srs, top_k=4)

    # Step 7: Build Final Architecture Graph
    graph = ArchitectureGraph(
        project_name=srs.project_name,
        style=primary_pattern.name,
        nodes=nodes,
        edges=valid_edges,
    )
    graph.plantuml = graph.to_plantuml()

    total_time = time.time() - t_start
    print(f"[ArcGen Pipeline Complete] Total execution time: {total_time:.2f}s\n")

    return graph, tradeoff_table, report, srs
