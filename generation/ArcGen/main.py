"""ArcGen Main CLI Entry Point.

Supports:
1. Interactive Elicitation Mode (Phase A -> Phase B):
   python main.py
   python main.py --prompt "I want to build an IoT platform"
   python main.py --provider groq

2. Direct Batch Generation from SRS File (Phase B directly):
   python main.py --file path/to/srs.txt --project "MySystem"
   python main.py --file path/to/srs.txt --provider groq
"""

import argparse
import json
import sys
from pathlib import Path

# Ensure repo root is on sys.path and stdout handles utf-8
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from generation.ArcGen.phase_a.interactive_cli import run_interactive_elicitation
from generation.ArcGen.generator import generate_architecture_from_srs
from generation.ArcGen.llm import get_llm_client


def main():
    parser = argparse.ArgumentParser(
        description="ArcGen: Requirement-Grounded Architecture Generation System"
    )
    parser.add_argument(
        "--file", "-f",
        type=str,
        help="Path to full SRS document for direct Phase B generation",
        default=None,
    )
    parser.add_argument(
        "--prompt", "-p",
        type=str,
        help="Initial vague prompt for Phase A interactive elicitation",
        default="",
    )
    parser.add_argument(
        "--project",
        type=str,
        help="Project name",
        default="GeneratedArchitecture",
    )
    parser.add_argument(
        "--provider",
        type=str,
        choices=["omnikey", "groq", "ollama"],
        help="LLM provider: 'omnikey' (unified cloud), 'groq' (fast cloud), or 'ollama' (local)",
        default=None,
    )
    parser.add_argument(
        "--model",
        type=str,
        help="Specific model name (e.g. 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'qwen2.5-coder:32b')",
        default=None,
    )
    parser.add_argument(
        "--out", "-o",
        type=str,
        help="Output JSON file path",
        default="architecture_output.json",
    )

    args = parser.parse_args()

    client = get_llm_client(provider=args.provider, model=args.model)

    # Mode 1: Direct Generation from SRS file
    if args.file:
        file_path = Path(args.file.strip().strip("'\""))
        if not file_path.exists():
            print(f"Error: File not found at {file_path}")
            sys.exit(1)

        print(f"Reading SRS document from {file_path}...")
        with open(file_path, "r", encoding="utf-8") as f:
            raw_text = f.read()

        print(f"Executing Phase B Generation for '{args.project}'...")
        graph, tradeoff_table, report, srs = generate_architecture_from_srs(
            raw_srs_text=raw_text,
            project_name=args.project,
            client=client,
        )

        print("\n" + "=" * 60)
        print("DETERMINISTIC ATAM TRADEOFF TABLE")
        print("=" * 60)
        print(tradeoff_table)

        print("\n" + "=" * 60)
        print(f"GENERATED ARCHITECTURE: {graph.project_name} ({graph.style})")
        print("=" * 60)
        print(f"Nodes: {len(graph.nodes)} | Edges: {len(graph.edges)} | Orphan Ratio: {report.orphan_ratio:.1%}")
        print(f"Requirement Coverage: {report.requirement_coverage_pct:.1f}%")

        # Save outputs
        out_path = Path(args.out)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(graph.model_dump(), f, indent=2)
        print(f"\nSaved Architecture JSON to {out_path.resolve()}")

        puml_path = out_path.with_suffix(".puml")
        with open(puml_path, "w", encoding="utf-8") as f:
            f.write(graph.to_plantuml())
        print(f"Saved PlantUML diagram to {puml_path.resolve()}")

        mmd_path = out_path.with_suffix(".mmd")
        with open(mmd_path, "w", encoding="utf-8") as f:
            f.write(graph.to_mermaid())
        print(f"Saved Mermaid diagram to  {mmd_path.resolve()}")

    # Mode 2: Interactive Phase A Elicitation Loop
    else:
        run_interactive_elicitation(initial_prompt=args.prompt, client=client)


if __name__ == "__main__":
    main()