"""Demonstration of ArcGen Phase A Prompt-Based Elicitation.

Scenario:
The user begins with a vague prompt containing only ~20% of necessary architectural information:
'I want to build an IoT fleet monitoring system for 500 connected delivery vans.'

Phase A:
1. Initial Assessment: Extracts initial scale (500 vans) -> ~17.9% ASR coverage.
2. Interview Dialogue: Identifies missing architectural drivers and asks targeted questions.
3. Realistic stakeholder answers are supplied turn-by-turn.
4. Mathematical stopping criteria fires when coverage reaches >= 85%.
5. Hands off to Phase B to generate the complete requirement-grounded architecture.
"""

import json
import sys
import time
from pathlib import Path

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from generation.ArcGen.phase_a.asr_tracker import ASRTracker
from generation.ArcGen.phase_a.elicitation_agent import ElicitationAgent
from generation.ArcGen.generator import generate_architecture_from_srs
from generation.ArcGen.llm import get_llm_client


def print_status(tracker: ASRTracker, round_num: int = 0):
    pct = tracker.coverage_percentage
    bar_width = 30
    filled_width = int(round(bar_width * (tracker.coverage_ratio)))
    bar = "#" * filled_width + "-" * (bar_width - filled_width)
    print(f"\n[{bar}] {pct:.1f}% ASR Coverage (Turn {round_num})")
    for dim, slot in tracker.slots.items():
        if slot.filled:
            val = slot.value or slot.raw_response
            print(f"  * {dim.value:<32} [FILLED: {val[:30]}] (wt: {slot.weight})")
        else:
            print(f"  * {dim.value:<32} [MISSING]")
    print("")


def main():
    print("==================================================================")
    print("      ARCGEN: PROMPT-BASED ELICITATION TEST (20% INITIAL INFO)    ")
    print("==================================================================\n")

    initial_prompt = "I want to build an IoT fleet monitoring system for 500 connected delivery vans."
    print(f"INITIAL VAGUE USER PROMPT:\n\"{initial_prompt}\"\n")

    client = get_llm_client()
    agent = ElicitationAgent(client=client)
    tracker = ASRTracker()

    # Step 1: Initial Assessment
    print(">>> STEP 1: Running Phase A Initial Assessment on vague prompt...")
    extracted = agent.initial_assessment(initial_prompt, tracker)
    print(f"Extracted {len(extracted)} pre-existing architectural driver(s):")
    for e in extracted:
        print(f"  - {e.dimension.value}: {e.raw_text} (metric={e.metric}, value={e.value})")
    
    print_status(tracker, round_num=0)

    # Simulated stakeholder responses for missing dimensions
    # Ordered to respond appropriately based on the targeted dimension
    simulated_answers = {
        "Latency Budget": "We need sub-second latency, specifically under 500ms for emergency driver alerts and geofence violations.",
        "Data Consistency Model": "Eventual consistency is acceptable for live GPS telemetry, but strict ACID consistency is required for dispatch orders and trip logs.",
        "Availability / Fault Tolerance": "99.9% uptime SLA. Vans must operate offline when in dead zones and sync cached telemetry upon reconnection.",
        "Deployment Target": "Hybrid edge-cloud architecture: lightweight edge agent running on the in-vehicle unit, backend hosted on AWS EKS (Kubernetes).",
        "Security / Compliance": "Mutual TLS (mTLS) for device-to-cloud communications and role-based JWT authentication for fleet operators.",
        "Cost Constraint": "Low operational cost; prefer serverless or autoscaling components to handle off-peak overnight hours.",
    }

    # Step 2: Phase A Interview Loop
    print(">>> STEP 2: Commencing Phase A Targeted Elicitation Loop...")
    round_count = 0
    while True:
        round_count += 1
        question = agent.generate_question(tracker, project_context=initial_prompt)
        if not question:
            print("No further questions generated.")
            break

        print("------------------------------------------------------------------")
        print(f"[ROUND {round_count}] Question for: {question.target_dimension.value}")
        print(f">> {question.question_text}")
        print(f"Why it matters: {question.why_it_matters}")
        if question.suggested_options:
            print("Options offered by agent:")
            for opt in question.suggested_options[:3]:
                print(f"   - {opt}")

        # Pick simulated answer matching this dimension
        ans = simulated_answers.get(
            question.target_dimension.value,
            "Standard production cloud requirements with automated monitoring."
        )
        print(f"\nStakeholder Response: \"{ans}\"")

        # Process and extract
        agent.process_answer(question, ans, tracker)
        print_status(tracker, round_num=round_count)

        # Check mathematical stopping criteria
        should_stop, reason = tracker.record_round_completion()
        if should_stop:
            print(f">>> STOPPING CRITERION SATISFIED: {reason}\n")
            break

    # Step 3: Synthesize SRS
    print("==================================================================")
    print(">>> STEP 3: Synthesizing Grounded SRS Document from Elicitation...")
    print("==================================================================")
    srs = agent.synthesize_srs(initial_prompt, tracker)
    srs.project_name = "FleetMonitor-IoT"
    print(f"Synthesized SRS: {len(srs.asrs)} ASRs, {len(srs.all_requirements)} total requirements.")
    for a in srs.asrs:
        print(f"  [{a.req_id}] ({a.arch_dimension.value if a.arch_dimension else 'ASR'}) {a.raw_text}")

    # Step 4: Phase B Architecture Generation
    print("\n==================================================================")
    print(">>> STEP 4: Executing Phase B Architecture Generation...")
    print("==================================================================")
    graph, tradeoff_table, report, _ = generate_architecture_from_srs(
        srs_document=srs,
        project_name="FleetMonitor-IoT",
        client=client,
    )

    print("\n------------------------------------------------------------------")
    print("DETERMINISTIC ATAM TRADEOFF TABLE")
    print("------------------------------------------------------------------")
    print(tradeoff_table)

    print("\n------------------------------------------------------------------")
    print(f"GENERATED ARCHITECTURE: {graph.project_name} ({graph.style})")
    print("------------------------------------------------------------------")
    for node in graph.nodes:
        print(f" - [{node.node_id}] {node.name} ({node.node_type.value} | Layer: {node.layer or 'None'})")
        print(f"   Traced: {node.traced_requirements} | KB: {node.kb_citations}")

    print("\n------------------------------------------------------------------")
    print("RELATIONS & DATA FLOWS")
    print("------------------------------------------------------------------")
    for edge in graph.edges:
        print(f" - {edge.source} ---> {edge.target} [{edge.edge_type.value} | {edge.protocol}]")
        print(f"   Justification: {edge.justification}")

    print("\n------------------------------------------------------------------")
    print("GRAPH VALIDATION REPORT")
    print("------------------------------------------------------------------")
    print(f"Nodes: {report.total_nodes} | Edges: {report.total_edges}")
    print(f"Orphan Nodes: {report.orphan_nodes} (Ratio: {report.orphan_ratio:.1%})")
    print(f"Requirement Coverage: {report.requirement_coverage_pct:.1f}%")
    print(f"Graph Valid: {report.is_valid}")

    # Save artifacts
    out_dir = REPO_ROOT / "generation" / "ArcGen"
    out_json = out_dir / "fleet_architecture.json"
    out_puml = out_dir / "fleet_architecture.puml"
    out_mmd = out_dir / "fleet_architecture.mmd"

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(graph.model_dump(), f, indent=2)
    with open(out_puml, "w", encoding="utf-8") as f:
        f.write(graph.to_plantuml())
    with open(out_mmd, "w", encoding="utf-8") as f:
        f.write(graph.to_mermaid())

    print(f"\nSaved Architecture JSON:  {out_json.name}")
    print(f"Saved PlantUML Diagram:   {out_puml.name}")
    print(f"Saved Mermaid.js Diagram: {out_mmd.name}")
    print("==================================================================")


if __name__ == "__main__":
    main()
