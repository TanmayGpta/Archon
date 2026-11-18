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
    ("allam", "allam"),
    ("canopy", "canopylabs"),
    ("minimax", "minimax"),
    ("orpheus", "canopylabs"),
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

    Models with skip=True are never seated regardless of family.
    """
    excluded = sorted({family_of(m) for m in generator_models if m})

    from app.llm import is_model_blocked

    # Only seat models that are not flagged skip=True or runtime-blocked
    eligible_jurors = [j for j in rubric.jurors if not j.skip and not is_model_blocked(j.model)]
    eligible_spares = [s for s in rubric.spares if not s.skip and not is_model_blocked(s.model)]
    if not eligible_jurors and not eligible_spares:
        eligible_jurors = [j for j in rubric.jurors if not j.skip]
        eligible_spares = [s for s in rubric.spares if not s.skip]

    panel = [j for j in eligible_jurors if j.family not in excluded]
    seated_families = {j.family for j in panel}
    seated_models = {j.model for j in panel}
    target_count = len(eligible_jurors) if eligible_jurors else 5

    # Pass 1: Try to seat spares with unused families
    for spare in eligible_spares:
        if len(panel) >= target_count:
            break
        if spare.family not in excluded and spare.family not in seated_families and spare.model not in seated_models:
            panel.append(spare)
            seated_families.add(spare.family)
            seated_models.add(spare.model)

    # Pass 2: If distinct families ran out (e.g. single-provider cloud setup), seat spares not in generator family
    for spare in eligible_spares:
        if len(panel) >= target_count:
            break
        if spare.family not in excluded and spare.model not in seated_models:
            panel.append(spare)
            seated_models.add(spare.model)

    # Pass 3: If fewer than 3 jurors are seated (e.g. single-provider cloud with few non-generator
    # families), fill up to 3 distinct models other than the exact generator model; only fall back
    # to the generator model itself if the panel is completely empty.
    if len(panel) < 3:
        gen_models = {m.lower() for m in generator_models if m}
        cap = min(max(target_count, 1), 3)
        candidates = list(eligible_spares) + list(eligible_jurors)
        for cand in candidates:
            if len(panel) >= cap:
                break
            if cand.model.lower() not in gen_models and cand.model not in seated_models:
                panel.append(cand)
                seated_models.add(cand.model)
        if not panel:
            for cand in candidates:
                if len(panel) >= cap:
                    break
                if cand.model not in seated_models:
                    panel.append(cand)
                    seated_models.add(cand.model)

    return panel, excluded
