"""The ADK jury: one LlmAgent per (juror, checkpoint) on local Ollama via LiteLlm.

Shape: ParallelAgent[ juror_1: SequentialAgent[cp_a, cp_b], juror_2: ..., ... ]

Independence:
- every juror gets its own case (shuffled order) through an InstructionProvider, so no juror
  sees another's case or verdict, and no session state is shared between them;
- include_contents="none": no conversation history leaks in, not even between one juror's own
  checkpoints;
- a juror that errors or times out abstains (on_model_error_callback) instead of failing the panel.

Model swaps: Ollama on a 6 GB GPU holds one small model at a time, and loading one costs far more
than a verdict. So each juror judges *every* pending checkpoint back-to-back while its model is
loaded, and a juror holds a semaphore (rubric.ollama.max_concurrent, default 1) for its whole
sequence. One sitting therefore loads each juror model once. On bigger hardware raise
max_concurrent and jurors really run side by side.
"""

import asyncio
import logging
import os
import time
from typing import AsyncGenerator, Callable, Dict, List, Optional, Tuple

from google.adk.agents import LlmAgent, ParallelAgent, SequentialAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import PrivateAttr

from app.jury.aggregate import parse_verdict
from app.jury.case import Case
from app.jury.models import CheckpointName, JurorSpec, JurorVerdict, Rubric, load_rubric
from app.llm import DEFAULT_OLLAMA_HOST

JUROR_ERROR = "JUROR_ERROR:"
logger = logging.getLogger(__name__)

JUROR_INSTRUCTION = """You are an independent juror reviewing a software architecture generator's work.
Judge ONLY from the case below. Be strict and literal. Do not assume facts that are not written.

For each question answer "yes" or "no".
- "yes" means the check passes.
- "no" means it fails, and you MUST list the IDs that prove it in "cite" (only IDs that appear in the case).
  A "no" without valid IDs is ignored.

Reply with JSON only, no other text:
{"answers": [{"item": "<question id>", "verdict": "yes" | "no", "cite": ["<ID>", ...], "reason": "<one short sentence>"}]}

=== CASE ===
"""


Seat = Tuple[str, JurorSpec, Case]
Sitting = Tuple[CheckpointName, List[Seat]]


class _GatedJuror(SequentialAgent):
    """One juror's checkpoints in order, holding the shared gate throughout so its model stays loaded."""

    _gate: Optional[asyncio.Semaphore] = PrivateAttr(default=None)

    async def _run_async_impl(self, ctx) -> AsyncGenerator:
        if self._gate is None:
            async for e in super()._run_async_impl(ctx):
                yield e
            return
        async with self._gate:
            async for e in super()._run_async_impl(ctx):
                yield e


def _on_model_error(callback_context, llm_request, error) -> LlmResponse:
    """Turn a failed juror call into an abstention instead of aborting the whole panel."""
    msg = f"{JUROR_ERROR} {type(error).__name__}: {str(error)[:300]}"
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=msg)]))


class AdkJuryPanel:
    def __init__(
        self,
        rubric: Optional[Rubric] = None,
        ollama_host: Optional[str] = None,
        is_cloud: bool = False,
        api_keys: Optional[Dict[str, str]] = None,
    ):
        self.is_cloud = is_cloud
        raw_rubric = rubric or load_rubric()
        self.rubric = raw_rubric.for_mode(is_cloud) if hasattr(raw_rubric, "for_mode") else raw_rubric
        self.host = ollama_host or DEFAULT_OLLAMA_HOST
        self.api_keys = api_keys or {}

    def judge(
        self,
        checkpoint: CheckpointName,
        seats: List[Seat],
        on_verdict: Callable[[JurorVerdict], None],
    ) -> List[JurorVerdict]:
        return self.judge_many([(checkpoint, seats)], lambda _cp, v: on_verdict(v))[checkpoint]

    def judge_many(
        self,
        sittings: List[Sitting],
        on_verdict: Callable[[CheckpointName, JurorVerdict], None],
    ) -> Dict[CheckpointName, List[JurorVerdict]]:
        """Judge several checkpoints in one sitting, grouped by juror model (one load per model)."""
        # Called from the pipeline's worker thread, which has no running event loop.
        return asyncio.run(self._judge_many(sittings, on_verdict))

    def _agent(self, checkpoint: CheckpointName, idx: int, spec: JurorSpec, case: Case) -> LlmAgent:
        ids = ", ".join(it.id for it in self.rubric.checkpoints[checkpoint].items)
        prompt = (
            JUROR_INSTRUCTION + case.text
            + f"\n\nAnswer EVERY question ({ids}), one entry each, in the JSON format above."
            + (f"\n{spec.prompt_suffix}" if spec.prompt_suffix else "")
        )
        if self.is_cloud or (spec.provider and spec.provider != "ollama"):
            prov = (spec.provider or "groq").lower()
            if prov == "groq":
                key = self.api_keys.get("groq") or os.getenv("GROQ_API_KEY") or os.getenv("groq")
                model_name = f"groq/{spec.model}" if not spec.model.startswith("groq/") else spec.model
                model = LiteLlm(
                    model=model_name,
                    api_key=key,
                    timeout=90,
                    response_format={"type": "json_object"},
                )
            elif prov in ("omnikey", "gemini"):
                key = self.api_keys.get("omnikey") or os.getenv("OMNIKEY_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("omnikey")
                model_name = f"gemini/{spec.model}" if not spec.model.startswith("gemini/") else spec.model
                model = LiteLlm(
                    model=model_name,
                    api_key=key,
                    timeout=90,
                    response_format={"type": "json_object"},
                )
            else:
                model_name = spec.model
                model = LiteLlm(
                    model=model_name,
                    timeout=90,
                    response_format={"type": "json_object"},
                )
        else:
            extra = {"reasoning_effort": "none"} if spec.think is False else {}  # LiteLLM -> Ollama think: false
            model = LiteLlm(
                model=f"ollama_chat/{spec.model}",
                api_base=self.host,
                timeout=self.rubric.ollama.timeout_s,
                num_ctx=self.rubric.ollama.num_ctx,
                format="json",
                **extra,
            )
        return LlmAgent(
            name=f"juror_{idx}_{checkpoint}",
            model=model,
            instruction=lambda _ctx, p=prompt: p,  # provider => no state templating, no sharing
            include_contents="none",
            generate_content_config=types.GenerateContentConfig(temperature=0.0),
            on_model_error_callback=_on_model_error,
        )

    async def _judge_many(self, sittings: List[Sitting], on_verdict) -> Dict[CheckpointName, List[JurorVerdict]]:
        concurrency = 2 if self.is_cloud else max(1, self.rubric.ollama.max_concurrent)
        gate = asyncio.Semaphore(concurrency)
        # agent name -> (checkpoint, seat); jurors keyed by model so a model is loaded once
        by_name: Dict[str, Tuple[CheckpointName, Seat]] = {}
        per_model: Dict[str, List[LlmAgent]] = {}
        order: Dict[CheckpointName, List[str]] = {}
        for checkpoint, seats in sittings:
            order[checkpoint] = []
            for i, seat in enumerate(seats, 1):
                _, spec, case = seat
                agent = self._agent(checkpoint, i, spec, case)
                by_name[agent.name] = (checkpoint, seat)
                per_model.setdefault(spec.model, []).append(agent)
                order[checkpoint].append(agent.name)

        jurors = []
        for n, (model, agents) in enumerate(per_model.items(), 1):
            juror = _GatedJuror(name=f"juror_{n}", sub_agents=agents)
            juror._gate = gate
            jurors.append(juror)

        jury = ParallelAgent(name="jury", sub_agents=jurors)
        runner = InMemoryRunner(agent=jury, app_name="arcgen_jury")
        session = await runner.session_service.create_session(app_name="arcgen_jury", user_id="arcgen")
        verdicts: Dict[str, JurorVerdict] = {}
        last = time.monotonic()  # with one juror at a time, the gap between verdicts is that call's time (load included)

        message = types.Content(role="user", parts=[types.Part(text="Deliver your verdict as JSON.")])
        try:
            async for event in runner.run_async(user_id="arcgen", session_id=session.id, new_message=message):
                name = event.author
                if name not in by_name or name in verdicts or not event.is_final_response():
                    continue
                checkpoint, (seat, spec, case) = by_name[name]
                cp = self.rubric.checkpoints[checkpoint]
                now = time.monotonic()
                seconds, last = now - last, now
                # Skip reasoning ("thought") parts from thinking models such as qwen3; keep the answer.
                parts = event.content.parts if event.content and event.content.parts else []
                text = "".join(p.text for p in parts if p.text and not getattr(p, "thought", False))
                if text.startswith(JUROR_ERROR):
                    v = JurorVerdict(juror=seat, model=spec.model, family=spec.family, ok=False,
                                     error=text[len(JUROR_ERROR):].strip(), seconds=round(seconds, 1))
                else:
                    v = parse_verdict(text, cp, case, seat, spec, seconds=seconds)
                if not v.ok:
                    logger.warning(f"{checkpoint}: {seat} ({spec.model}) abstained: {v.error}")
                verdicts[name] = v
                on_verdict(checkpoint, v)
        finally:
            await runner.close()

        out: Dict[CheckpointName, List[JurorVerdict]] = {}
        for checkpoint, names in order.items():  # jurors that never answered abstain
            out[checkpoint] = []
            for name in names:
                if name in verdicts:
                    out[checkpoint].append(verdicts[name])
                    continue
                _, (seat, spec, _) = by_name[name]
                v = JurorVerdict(juror=seat, model=spec.model, family=spec.family, ok=False, error="no response")
                logger.warning(f"{checkpoint}: {seat} ({spec.model}) abstained: no response")
                on_verdict(checkpoint, v)
                out[checkpoint].append(v)
        return out


# Backwards compatibility alias
AdkOllamaPanel = AdkJuryPanel

