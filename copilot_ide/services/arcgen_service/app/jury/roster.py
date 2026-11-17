"""Chooses the five jurors: distinct model families, none sharing a family with the generator."""

from typing import Iterable, List, Tuple

from app.jury.models import JurorSpec, Rubric

# Substring -> family. Gemma and Gemini are both Google models, so they count as one family.
_FAMILY_KEYS = [
    ("deepseek", "deepseek"),
    ("qwen", "qwen"),
    ("llama", "llama"),
    ("gemma", "google"),
    ("gemini", "google"),
    ("phi", "phi"),
    ("granite", "granite"),
    ("mixtral", "mistral"),
    ("mistral", "mistral"),
    ("openai", "openai"),
    ("gpt", "openai"),
    ("minimax", "minimax"),
]


def family_of(model: str) -> str:
    m = (model or "").lower()
    for key, fam in _FAMILY_KEYS:
        if key in m:
            return fam
    return m or "unknown"


def select_panel(rubric: Rubric, generator_models: Iterable[str]) -> Tuple[List[JurorSpec], List[str]]:
    """Returns (panel, excluded_families).

    Jurors whose family produced any part of the generation are replaced by spares of an unused
    family, in order. If distinct families run out (e.g. single-provider cloud setup), spares of
    non-generator families fill the panel. If spares run out the panel is smaller; the aggregate flags it.
    """
    excluded = sorted({family_of(m) for m in generator_models if m})
    panel = [j for j in rubric.jurors if j.family not in excluded]
    seated_families = {j.family for j in panel}
    seated_models = {j.model for j in panel}

    # Pass 1: Try to seat spares with unused families
    for spare in rubric.spares:
        if len(panel) >= len(rubric.jurors):
            break
        if spare.family not in excluded and spare.family not in seated_families:
            panel.append(spare)
            seated_families.add(spare.family)
            seated_models.add(spare.model)

    # Pass 2: If distinct families ran out (e.g. single-provider cloud), seat spares not in generator family
    for spare in rubric.spares:
        if len(panel) >= len(rubric.jurors):
            break
        if spare.family not in excluded and spare.model not in seated_models:
            panel.append(spare)
            seated_models.add(spare.model)

    return panel, excluded
