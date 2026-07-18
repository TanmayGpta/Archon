# Archon

Multi-agent system that generates software architecture from requirements and verifies whether a codebase actually conforms to it. Built on LangGraph — no model training or GPU required.

## Overview

Archon has two connected halves:

1. **Generation** — given a software requirements specification (SRS), a scoped multi-agent pipeline (adapted from the MAAD framework) produces a human-readable architecture diagram plus a machine-readable ruleset describing allowed dependencies between architectural layers.

2. **Conformance Checking** — given an actual codebase, the system extracts its real dependency graph, maps modules onto the declared architectural layers using an LLM classification agent, and checks it against the ruleset from step 1 — flagging layering violations, circular dependencies, and producing an overall architecture health score.

The two halves connect through a single shared contract: a Pydantic-validated JSON ruleset schema (see `shared/schema.py`), inspired by the layer-contract model used in import-linter (https://import-linter.readthedocs.io/).

## Why this project

Existing research on LLMs for software architecture focuses heavily on generation (e.g., MAAD, arXiv:2606.01385); architecture conformance checking — verifying that an already-implemented codebase still matches its intended design — remains an explicitly underexplored task (Schmid et al., arXiv:2505.16697). Archon targets that gap directly.

## Architecture Flow

SRS (text)
   -> [Generation Agents]
   -> architecture diagram + JSON ruleset
   -> [Conformance Agents] (given an actual codebase)
   -> violation report + health score

## Tech Stack

- LangGraph — agent orchestration for both halves
- Pydantic — shared ruleset schema/contract validation
- Claude / GPT API — LLM calls (no fine-tuning, no local GPU needed)
- networkx — dependency graph construction, cycle detection
- ast / pydeps — static dependency extraction from Python codebases
- click — CLI interface

## Project Structure

archon/
├── shared/            # jointly-owned: schema, fixtures, CLI entry point
├── generation/         # SRS -> architecture + ruleset
├── conformance/        # codebase -> violation report
└── docs/               # design decisions, evaluation results

## Usage

# Generate an architecture + ruleset from an SRS
python -m shared.cli.main generate --srs requirements.txt --out architecture.json

# Check a codebase against a ruleset
python -m shared.cli.main check --repo ./target-codebase --rules architecture.json --out report.html

## Status

Work in progress — 3-month build, 2 contributors. See docs/architecture_decisions.md for schema decisions and docs/evaluation.md for accuracy/benchmark results as they're produced.

## References

- Schmid et al., Software Architecture Meets LLMs: A Systematic Literature Review, arXiv:2505.16697
- Li et al., Bridging Requirements and Architecture: Multi-Agent Orchestration with External Knowledge and Hierarchical Memory (MAAD), arXiv:2606.01385
- import-linter (https://import-linter.readthedocs.io/) — layer contract model reference

## License

MIT