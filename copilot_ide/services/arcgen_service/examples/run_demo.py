"""Demo script to run ArcGen end-to-end on a benchmark SRS case."""

import json
import sys
from pathlib import Path

# Ensure the service root (the folder holding app/) is on sys.path and stdout handles utf-8
SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from app.generator import generate_architecture_from_srs
from app.llm import get_llm_client


def main():
    srs_path = Path(__file__).resolve().parent / "C2C.txt"
    if not srs_path.exists():
        print(f"Error: SRS file not found at {srs_path}")
        return

    print("=================================================================")
    print("         ARCGEN: REQUIREMENT-GROUNDED ARCHITECTURE GENERATOR     ")
    print("=================================================================\n")
    print(f"Loading SRS: {srs_path.name}...")
    with open(srs_path, "r", encoding="utf-8") as f:
        full_text = f.read()

    # Use first 70 lines containing core requirements and constraints for clean demonstration
    srs_text = "\n".join(full_text.splitlines()[:70])

    client = get_llm_client()
    print(f"Executing Phase B Generation Pipeline via {type(client).__name__} ({client.model})...")
    graph, tradeoff_table, report, srs = generate_architecture_from_srs(
        raw_srs_text=srs_text,
        project_name="C2C-TxDOT",
        client=client,
    )

    print("\n-----------------------------------------------------------------")
    print("STEP 1: NORMALIZED REQUIREMENTS PROFILE")
    print("-----------------------------------------------------------------")
    print(f"Project: {srs.project_name}")
    print(f"Domain: {srs.domain}")
    print(f"Actors: {', '.join(srs.actors)}")
    print(f"External Systems: {', '.join(srs.external_systems)}")
    print(f"Extracted Requirements: {len(srs.functional_requirements)} FRs, "
          f"{len(srs.non_functional_requirements)} NFRs, {len(srs.asrs)} ASRs, {len(srs.technical_constraints)} TCs")

    print("\n-----------------------------------------------------------------")
    print("STEP 2: DETERMINISTIC ATAM TRADEOFF TABLE")
    print("-----------------------------------------------------------------")
    print(tradeoff_table)

    print("\n-----------------------------------------------------------------")
    print(f"STEP 3: GENERATED COMPONENTS (NODES) [{graph.style}]")
    print("-----------------------------------------------------------------")
    for n in graph.nodes:
        print(f" - [{n.node_id}] {n.name} ({n.node_type.value} | Layer: {n.layer or 'None'})")
        print(f"   Traced Reqs: {n.traced_requirements}")
        print(f"   KB Citations: {n.kb_citations}")
        print(f"   Summary: {n.description[:80]}...\n")

    print("-----------------------------------------------------------------")
    print("STEP 4: GENERATED RELATIONS & DATA FLOWS (EDGES)")
    print("-----------------------------------------------------------------")
    for e in graph.edges:
        print(f" - {e.source} ---> {e.target} [{e.edge_type.value} | {e.protocol}]")
        print(f"   Justification: {e.justification}")
        print(f"   Traced Reqs: {e.traced_requirements} | KB: {e.kb_citations}\n")

    print("-----------------------------------------------------------------")
    print("STEP 5: VALIDATION & CITATION AUDIT REPORT")
    print("-----------------------------------------------------------------")
    print(f"Total Nodes: {report.total_nodes}")
    print(f"Total Edges Proposed: {report.total_edges}")
    print(f"Valid Edges Kept: {report.valid_edges_count}")
    print(f"Rejected Edges (Uncited/Invalid): {report.rejected_edges_count}")
    print(f"Orphan Nodes: {report.orphan_nodes} (Ratio: {report.orphan_ratio:.1%})")
    print(f"Requirement Coverage: {report.requirement_coverage_pct:.1f}%")
    print(f"Graph Valid: {report.is_valid}")

    # Export artifacts
    out_dir = SERVICE_ROOT / "output"
    out_dir.mkdir(exist_ok=True)
    out_json = out_dir / "c2c_architecture.json"
    out_puml = out_dir / "c2c_architecture.puml"
    out_mmd = out_dir / "c2c_architecture.mmd"

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(graph.model_dump(), f, indent=2)
    with open(out_puml, "w", encoding="utf-8") as f:
        f.write(graph.to_plantuml())
    with open(out_mmd, "w", encoding="utf-8") as f:
        f.write(graph.to_mermaid())

    print("\n-----------------------------------------------------------------")
    print(f"Saved Architecture JSON:    {out_json.name}")
    print(f"Saved PlantUML Diagram:     {out_puml.name}")
    print(f"Saved Mermaid.js Diagram:   {out_mmd.name}")
    print("=================================================================")


if __name__ == "__main__":
    main()
