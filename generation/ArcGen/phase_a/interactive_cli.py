"""Interactive Terminal CLI for ArcGen Phase A Elicitation.

Connects the user via an interactive dialogue loop to the ElicitationAgent,
monitors computed stopping criteria, and feeds into Phase B Generation.
"""

import sys
from pathlib import Path

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from generation.ArcGen.phase_a.asr_tracker import ASRTracker
from generation.ArcGen.phase_a.elicitation_agent import ElicitationAgent
from generation.ArcGen.generator import generate_architecture_from_srs
from generation.ArcGen.llm import BaseLLMClient, get_llm_client
from typing import Optional


def print_progress_bar(tracker: ASRTracker):
    """Renders visual ASCII progress bar for ASR coverage."""
    cov = tracker.coverage_ratio
    pct = tracker.coverage_percentage
    bar_width = 30
    filled_width = int(round(bar_width * cov))
    bar = "=" * filled_width + "-" * (bar_width - filled_width)

    print(f"\n[{bar}] {pct:.1f}% ASR Coverage (Threshold: 85.0%)")
    print("Architectural Dimensions Status:")
    for dim, slot in tracker.slots.items():
        status = f"[FILLED: {slot.value or slot.raw_response[:25]}]" if slot.filled else "[PENDING]"
        print(f"  * {dim.value:<32} {status:<30} (Weight: {slot.weight})")
    print("")


def run_interactive_elicitation(
    initial_prompt: str = "",
    client: Optional[BaseLLMClient] = None,
):
    """Runs the interactive elicitation session in the terminal."""
    print("==================================================================")
    print("     ARCGEN: ARCHITECTURAL REQUIREMENT ELICITATION (Phase A)      ")
    print("==================================================================\n")

    if client is None:
        client = get_llm_client()

    agent = ElicitationAgent(client=client)
    tracker = ASRTracker()

    if not initial_prompt:
        print("Please describe your system or enter the path to an SRS file:")
        print("  - A vague idea:  'A real-time ride sharing platform connecting riders and drivers'")
        print("  - Or a file path: 'path/to/my_srs.txt'\n")
        try:
            initial_prompt = input("Your Input: ").strip()
        except EOFError:
            initial_prompt = "A real-time ride sharing platform connecting riders and drivers"
            print(f"Using default: {initial_prompt}")

    if not initial_prompt:
        print("No input provided. Exiting.")
        return

    # Auto-detect if user entered a file path (stripping optional outer quotes)
    cleaned_input = initial_prompt.strip().strip("'\"")
    possible_path = Path(cleaned_input)
    if possible_path.is_file():
        print(f"\n[Detected File Path] Reading requirements from '{possible_path.resolve()}'...")
        with open(possible_path, "r", encoding="utf-8") as f:
            initial_prompt = f.read()


    print("\nAnalyzing initial prompt for existing architectural drivers...")
    agent.initial_assessment(initial_prompt, tracker)
    print_progress_bar(tracker)

    # Check if initial prompt was already complete
    should_stop, reason = tracker.record_round_completion()

    # Interview loop
    while not should_stop:
        question = agent.generate_question(tracker, project_context=initial_prompt)
        if not question:
            break

        print("------------------------------------------------------------------")
        print(f"[Question {tracker.turn_count}] Target: {question.target_dimension.value}")
        print(f">> {question.question_text}")
        print(f"\nWhy it matters: {question.why_it_matters}")
        if question.suggested_options:
            print("\nSuggested options:")
            for opt in question.suggested_options:
                print(f"  - {opt}")
        print("------------------------------------------------------------------")

        try:
            user_answer = input("Your Answer (or type 'skip'): ").strip()
        except EOFError:
            user_answer = "skip"
            print("skip")

        if user_answer.lower() in ("exit", "quit"):
            print("Session aborted by user.")
            return

        print("\nProcessing answer...")
        agent.process_answer(question, user_answer, tracker)
        print_progress_bar(tracker)

        should_stop, reason = tracker.record_round_completion()
        if should_stop:
            print(f">>> STOPPING CRITERION MET: {reason}\n")
            break

    # Phase A complete -> Hand off to Phase B Generation
    print("==================================================================")
    print("          PHASE A COMPLETE: COMMENCING PHASE B GENERATION         ")
    print("==================================================================\n")

    print("Synthesizing normalized SRS document...")
    srs = agent.synthesize_srs(initial_prompt, tracker)

    print(f"Normalized SRS ready with {len(srs.asrs)} ASRs and {len(srs.all_requirements)} total requirements.")
    print("Handing off to Phase B (ATAM Matcher + Pass 1 & Pass 2 Generator)...\n")

    # Generate full architecture with the elicited requirements
    graph, tradeoff_table, report, _ = generate_architecture_from_srs(
        srs_document=srs,
        project_name=srs.project_name or "ElicitedProject",
        client=agent.client,
    )

    print("\n------------------------------------------------------------------")
    print("PHASE B: DETERMINISTIC ATAM TRADEOFF TABLE")
    print("------------------------------------------------------------------")
    print(tradeoff_table)

    print("\n------------------------------------------------------------------")
    print(f"PHASE B: GENERATED ARCHITECTURE BLUEPRINT [{graph.style}]")
    print("------------------------------------------------------------------")
    for node in graph.nodes:
        print(f" - [{node.node_id}] {node.name} ({node.node_type.value} | {node.layer or 'None'})")
        print(f"   Traced Reqs: {node.traced_requirements} | Citations: {node.kb_citations}")

    print("\n------------------------------------------------------------------")
    print("PHASE B: RELATIONS & DATA FLOWS")
    print("------------------------------------------------------------------")
    for edge in graph.edges:
        print(f" - {edge.source} ---> {edge.target} [{edge.edge_type.value} | {edge.protocol}]")
        print(f"   Justification: {edge.justification}\n")

    print("------------------------------------------------------------------")
    print(f"CITATION AUDIT: {report.valid_edges_count}/{report.total_edges} valid edges, "
          f"Orphan ratio: {report.orphan_ratio:.1%}, Coverage: {report.requirement_coverage_pct:.1f}%")

    # Export artifacts
    import json
    out_dir = REPO_ROOT / "generation" / "ArcGen"
    out_json = out_dir / "elicited_architecture.json"
    out_puml = out_dir / "elicited_architecture.puml"
    out_mmd = out_dir / "elicited_architecture.mmd"

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(graph.model_dump(), f, indent=2)
    with open(out_puml, "w", encoding="utf-8") as f:
        f.write(graph.to_plantuml())
    with open(out_mmd, "w", encoding="utf-8") as f:
        f.write(graph.to_mermaid())

    print(f"\nSaved Architecture JSON:    {out_json.name}")
    print(f"Saved PlantUML Diagram:     {out_puml.name}")
    print(f"Saved Mermaid.js Diagram:   {out_mmd.name}")
    print("==================================================================")



if __name__ == "__main__":
    run_interactive_elicitation()
