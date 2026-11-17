"""Data contracts for the bias jury: rubric, juror verdicts, tallies and the decision trace."""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Literal, Optional, Set

from pydantic import BaseModel, Field

CheckpointName = Literal["normalization", "architecture"]
CiteKind = Literal["raw_lines", "requirements", "asrs", "nodes", "edges"]
Route = Literal["normalize", "nodes", "edges", "pattern"]

# fmt values:
#   "json"       → model reliably emits bare JSON; use response_format: json_object on Groq
#   "no_think"   → thinking/reasoning model (Qwen3, DeepSeek-R1); skip response_format, use /no_think prompt
#   "text"       → plain text, no response_format (DeepSeek non-R1, etc.)
FmtMode = Literal["json", "no_think", "text"]

RUBRIC_PATH = Path(__file__).resolve().parent / "rubric.json"

# Patterns in model names that identify non-text-generation models we must never seat as jurors.
_DEFAULT_SKIP_PATTERNS = [
    "whisper", "tts", "guard", "embed", "audio", "orpheus", "arabic-saudi", "vision", "clip",
]

# Patterns that identify thinking/reasoning models → switch to no_think fmt automatically
_THINKING_MODEL_PATTERNS = ["qwen3", "qwen/qwen3", "deepseek-r1", "r1-distill"]


def _auto_fmt(model: str) -> FmtMode:
    """Infer the right output format from the model name when not explicitly set in the rubric."""
    m = model.lower()
    for pat in _THINKING_MODEL_PATTERNS:
        if pat in m:
            return "no_think"
    return "json"


def _should_skip(model: str, never_seat_patterns: List[str]) -> bool:
    m = model.lower()
    return any(pat in m for pat in (never_seat_patterns or _DEFAULT_SKIP_PATTERNS))


# --- Rubric (loaded from rubric.json) ---------------------------------------
class RubricItem(BaseModel):
    id: str
    question: str
    cite: CiteKind
    cite_help: str
    severity: Literal["critical", "major"]
    route: Route
    fix: str


class Checkpoint(BaseModel):
    title: str
    items: List[RubricItem]


class JurorSpec(BaseModel):
    model: str
    family: str
    prompt_suffix: str = ""
    # fmt controls how the juror's LLM call is configured:
    #   json      → response_format: json_object (default for well-behaved models)
    #   no_think  → no response_format; /no_think appended; thinking tags stripped in post-processing
    #   text      → no response_format; raw text goes through the full regex fallback parser
    fmt: FmtMode = "json"
    # think=False → pass reasoning_effort/think:false to the backend (Ollama only; Groq uses fmt)
    think: Optional[bool] = None
    provider: Optional[str] = None
    # skip=True → never seat this model; used as a marker for auto-discovered models that fail the probe
    skip: bool = False


class OllamaSettings(BaseModel):
    num_ctx: int = 8192
    timeout_s: int = 600
    max_concurrent: int = 1


class Rubric(BaseModel):
    max_regenerations: int = 2
    jurors: List[JurorSpec]
    spares: List[JurorSpec] = Field(default_factory=list)
    cloud_jurors: List[JurorSpec] = Field(default_factory=list)
    cloud_spares: List[JurorSpec] = Field(default_factory=list)
    never_seat_patterns: List[str] = Field(default_factory=lambda: list(_DEFAULT_SKIP_PATTERNS))
    ollama: OllamaSettings = Field(default_factory=OllamaSettings)
    checkpoints: Dict[CheckpointName, Checkpoint]
    available_models: Optional[List[str]] = None

    def for_mode(
        self,
        is_cloud: bool,
        available_providers: Optional[Iterable[str]] = None,
        available_models: Optional[Iterable[str]] = None,
    ) -> "Rubric":
        if not is_cloud:
            return self
        r = self.model_copy(deep=True)

        # Normalize live models list
        if available_models:
            r.available_models = [m.lower() for m in available_models if m]

        if not self.cloud_jurors:
            return r

        # 1. Filter by provider availability
        avail_providers: Optional[Set[str]] = None
        if available_providers is not None:
            avail_providers = {p.lower() for p in available_providers}

        def _provider_ok(spec: JurorSpec) -> bool:
            if avail_providers is None:
                return True
            return not spec.provider or spec.provider.lower() in avail_providers

        jurors = [j for j in self.cloud_jurors if _provider_ok(j)]
        spares = [s for s in self.cloud_spares if _provider_ok(s)]

        # 2. Filter by live models if we have them
        if r.available_models:
            avail_set = set(r.available_models)

            def _live(spec: JurorSpec) -> bool:
                m = spec.model.lower()
                # Exact match or substring match (e.g. "gpt-oss-120b" in "openai/gpt-oss-120b")
                return m in avail_set or any(m in a or a in m for a in avail_set)

            live_jurors = [j for j in jurors if _live(j)]
            live_spares = [s for s in spares if _live(s)]

            # 3. Auto-add any live models not already in the rubric, with auto-detected fmt
            from app.jury.roster import family_of
            known_models = {j.model.lower() for j in live_jurors} | {s.model.lower() for s in live_spares}
            skip_patterns = r.never_seat_patterns or _DEFAULT_SKIP_PATTERNS
            prov_name = next(iter(avail_providers)) if (avail_providers and len(avail_providers) == 1) else "groq"
            for m in r.available_models:
                if m in known_models:
                    continue
                if _should_skip(m, skip_patterns):
                    continue
                live_spares.append(JurorSpec(
                    model=m,
                    family=family_of(m),
                    provider=prov_name,
                    fmt=_auto_fmt(m),
                    prompt_suffix="/no_think" if _auto_fmt(m) == "no_think" else "",
                    think=False if _auto_fmt(m) == "no_think" else None,
                ))
                known_models.add(m)

            jurors = live_jurors or jurors
            spares = live_spares or spares

        # 4. Remove models that match never_seat_patterns (TTS, embed, etc.)
        skip_patterns = r.never_seat_patterns or _DEFAULT_SKIP_PATTERNS
        jurors = [j for j in jurors if not _should_skip(j.model, skip_patterns)]
        spares = [s for s in spares if not _should_skip(s.model, skip_patterns)]

        r.jurors = jurors if jurors else self.cloud_jurors
        r.spares = spares
        return r


@lru_cache(maxsize=1)
def load_rubric(path: Optional[str] = None) -> "Rubric":
    data = json.loads(Path(path or RUBRIC_PATH).read_text(encoding="utf-8"))
    # Strip comment-only keys before validation
    for key in [k for k in list(data.keys()) if k.startswith("_")]:
        data.pop(key, None)
    return Rubric.model_validate(data)


# --- What a juror returns -----------------------------------------------------
class ItemAnswer(BaseModel):
    item_id: str
    passed: bool
    cited: List[str] = Field(default_factory=list, description="IDs the juror cited that exist in the case")
    rejected_cites: List[str] = Field(default_factory=list, description="Cited IDs that do not exist (ignored)")
    reason: str = ""
    counted: bool = Field(True, description="False for a 'no' without a valid citation: it cannot fail the item")


class JurorVerdict(BaseModel):
    juror: str = Field(..., description="Anonymous seat name, e.g. 'Juror 3'")
    model: str
    family: str
    ok: bool = Field(True, description="False when the juror failed to answer or returned unparseable output")
    error: Optional[str] = None
    answers: List[ItemAnswer] = Field(default_factory=list)
    seconds: float = 0.0


# --- Aggregation --------------------------------------------------------------
class ItemTally(BaseModel):
    item_id: str
    question: str
    severity: str
    route: Route
    yes: int = 0
    no: int = 0
    uncited_no: int = 0
    abstain: int = 0
    failed: bool = False
    cited_counts: Dict[str, int] = Field(default_factory=dict)
    reasons: List[str] = Field(default_factory=list)


class CheckpointResult(BaseModel):
    checkpoint: CheckpointName
    attempt: int
    passed: bool
    voting_jurors: int
    low_independence: bool = Field(False, description="Fewer than 3 jurors from distinct families voted")
    excluded_families: List[str] = Field(default_factory=list)
    verdicts: List[JurorVerdict] = Field(default_factory=list)
    tallies: List[ItemTally] = Field(default_factory=list)
    routes: List[Route] = Field(default_factory=list, description="Where failing items send the work back")
    feedback: List[str] = Field(default_factory=list, description="Findings passed to the regeneration")


# --- Trace --------------------------------------------------------------------
class GraphDiff(BaseModel):
    nodes_added: List[str] = Field(default_factory=list)
    nodes_removed: List[str] = Field(default_factory=list)
    edges_added: List[str] = Field(default_factory=list)
    edges_removed: List[str] = Field(default_factory=list)
    style_changed: Optional[str] = None


class IterationRecord(BaseModel):
    version: int
    reason: str = Field(..., description="Why this version exists: 'initial', or the routes that triggered it")
    style: str
    graph: dict
    diff: Optional[GraphDiff] = None
    result: Optional[CheckpointResult] = None


class NormalizationRecord(BaseModel):
    attempt: int
    requirement_ids: List[str]
    asr_ids: List[str]
    result: Optional[CheckpointResult] = None


class JuryTrace(BaseModel):
    project_name: str
    verdict: Literal["PASS", "FAIL", "NO_JURY", "SKIPPED"] = "SKIPPED"
    generator_models: List[str] = Field(default_factory=list)
    normalization: List[NormalizationRecord] = Field(default_factory=list)
    iterations: List[IterationRecord] = Field(default_factory=list)
    pattern_stepdowns: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
