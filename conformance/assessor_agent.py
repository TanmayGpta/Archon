"""LLM assessment of one flagged dependency: what it costs, and whether the code does
anything better than the blueprint it is judged against. The violation itself always
comes from checker.py (AST graph + JSON rules); the LLM only explains and weighs it.
"""
import os
from typing import Any, Dict, List, Literal, Optional

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from conformance.classifier_agent import get_llm

SOURCE_CHARS = 6000   # violating module, read in full up to this
TARGET_CHARS = 2500   # imported module, enough to see what it offers


class ViolationAssessment(BaseModel):
    summary: str = Field(description="One or two sentences: what this import is used for in the source module.")
    hazard: str = Field(description="The concrete cost of this dependency in THIS code, not a generic rule restatement.")
    advantages: List[str] = Field(
        description="Specific things this implementation does better than the blueprint's prescribed structure "
                    "(e.g. avoids a pass-through layer, fewer moving parts). Empty list if there are none."
    )
    verdict: Literal["fix", "acceptable_deviation", "blueprint_gap"] = Field(
        description="fix = the blueprint is right here; acceptable_deviation = the trade-off is reasonable at this "
                    "scale; blueprint_gap = the blueprint lacks a rule this design legitimately needs."
    )
    recommendation: str = Field(description="What to do next, naming the modules involved.")


PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a senior software architect reviewing one dependency that a static
conformance checker flagged against the team's architecture blueprint.

Blueprint "{blueprint_name}":
Layers:
{layers_text}
Allowed layer dependencies:
{rules_text}

Judge the actual code, not the labels. Be honest in both directions:
- If the blueprint is right, say why this import hurts here and use verdict "fix".
- If the implementation is genuinely better than the prescribed structure in some respect,
  list those specific advantages. Never invent advantages; an empty list is the normal case."""),
    ("human", """Flagged: {source_module} ({source_layer}) imports {target_module} ({target_layer}).
Checker reason: {reason}
Import line {line_number}: {code_snippet}

Other dependencies of {source_module}:
{neighbours}

--- {source_module} source ---
{source_code}

--- {target_module} source (truncated) ---
{target_code}"""),
])


def default_provider() -> Optional[str]:
    """First provider with a key in the environment (same order as the CLI)."""
    for provider, key in (("groq", "GROQ_API_KEY"), ("groq", "GROQ_API_KEY_2"), ("gemini", "GOOGLE_API_KEY"),
                          ("nvidia", "NVIDIA_API_KEY"), ("openai", "OPENAI_API_KEY")):
        if os.getenv(key):
            return provider
    return None


def assess_violation(
    violation: Dict[str, Any],
    ruleset: Dict[str, Any],
    source_code: str,
    target_code: str,
    neighbours: List[str],
    blueprint_name: str = "blueprint",
    model_choice: str = "groq",
    nvidia_model: Optional[str] = None,
) -> ViolationAssessment:
    layers_text = "\n".join(f"- {l['name']}: {l.get('description', '')}" for l in ruleset.get("layers", []))
    rules_text = "\n".join(
        f"- {r['source_layer']} -> {r['target_layer']}"
        for r in ruleset.get("rules", []) if r.get("type") == "allow"
    ) or "- (none)"
    api_key = (os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY_2")) if model_choice == "groq" else None
    chain = PROMPT | get_llm(model_choice, nvidia_model=nvidia_model, schema=ViolationAssessment, api_key=api_key)
    return chain.invoke({
        "blueprint_name": blueprint_name,
        "layers_text": layers_text,
        "rules_text": rules_text,
        "source_module": violation["source_module"],
        "target_module": violation["target_module"],
        "source_layer": violation["source_layer"],
        "target_layer": violation["target_layer"],
        "reason": violation.get("reason", ""),
        "line_number": violation.get("line_number") or "?",
        "code_snippet": violation.get("code_snippet") or "",
        "neighbours": "\n".join(f"- {n}" for n in neighbours) or "- (none)",
        "source_code": source_code[:SOURCE_CHARS] or "(source not found)",
        "target_code": target_code[:TARGET_CHARS] or "(source not found)",
    })
