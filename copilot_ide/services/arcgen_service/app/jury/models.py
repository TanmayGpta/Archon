"""Data contracts for the bias jury: rubric, juror verdicts, tallies and the decision trace."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Literal, Optional, Set

from pydantic import BaseModel, Field

CheckpointName = Literal["normalization", "architecture"]
CiteKind = Literal["raw_lines", "requirements", "asrs", "nodes", "edges"]
Route = Literal["normalize", "nodes", "edges", "pattern"]

RUBRIC_PATH = Path(__file__).resolve().parent / "rubric.json"


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
    # False switches a thinking model's reasoning off at the Ollama API (think: false). A prompt hint
    # like /no_think is not enough: qwen3 still reasons for thousands of tokens, overflows num_ctx
    # and returns a truncated answer (the juror then abstains).
    think: Optional[bool] = None
    provider: Optional[str] = None


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
        if available_models:
            r.available_models = [m.lower() for m in available_models if m]
        if self.cloud_jurors:
            if available_providers is not None:
                avail = {p.lower() for p in available_providers}
                jurors = [j for j in self.cloud_jurors if not j.provider or j.provider.lower() in avail]
                spares = [j for j in self.cloud_spares if not j.provider or j.provider.lower() in avail]
            else:
                jurors = self.cloud_jurors
                spares = self.cloud_spares

            # If live available models are specified, prioritize live models
            if r.available_models:
                avail_set = set(r.available_models)
                valid_jurors = [
                    j for j in jurors
                    if j.model.lower() in avail_set or any(j.model.lower() in m or m in j.model.lower() for m in avail_set)
                ]
                valid_spares = [
                    s for s in spares
                    if s.model.lower() in avail_set or any(s.model.lower() in m or m in s.model.lower() for m in avail_set)
                ]
                from app.jury.roster import family_of
                known = {j.model.lower() for j in valid_jurors} | {s.model.lower() for s in valid_spares}
                for m in r.available_models:
                    if m.lower() not in known and not any(x in m for x in ("whisper", "tts", "guard", "embed")):
                        prov = next(iter(available_providers)) if (available_providers and len(available_providers) == 1) else "groq"
                        valid_spares.append(JurorSpec(model=m, family=family_of(m), provider=prov))
                        known.add(m.lower())
                if valid_jurors:
                    jurors = valid_jurors
                if valid_spares:
                    spares = valid_spares

            r.jurors = jurors if jurors else self.cloud_jurors
            r.spares = spares
        return r


@lru_cache(maxsize=1)
def load_rubric(path: Optional[str] = None) -> Rubric:
    data = json.loads(Path(path or RUBRIC_PATH).read_text(encoding="utf-8"))
    data.pop("_comment", None)
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
