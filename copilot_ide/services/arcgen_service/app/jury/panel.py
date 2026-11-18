"""The ADK jury: one LlmAgent per (juror, checkpoint) on Groq Cloud or local Ollama via LiteLlm.

Shape: ParallelAgent[ juror_1: SequentialAgent[cp_a, cp_b], juror_2: ..., ... ]

Independence:
- every juror gets its own case (shuffled order) through an InstructionProvider, so no juror
  sees another's case or verdict, and no session state is shared between them;
- include_contents="none": no conversation history leaks in, not even between one juror's own
  checkpoints;
- a juror that errors or times out abstains (on_model_error_callback) instead of failing the panel.

Model configuration per JurorSpec.fmt:
  "json"      → response_format: json_object  (clean JSON models: gpt-oss, llama, gemma, phi…)
  "no_think"  → no response_format; reasoning_effort=none on Groq; /no_think suffix appended to prompt
  "text"      → no response_format; relies on clean_thinking() + regex fallback parser

One sitting therefore loads each juror model once. On bigger hardware raise
rubric.ollama.max_concurrent and jurors really run side by side.
"""

import asyncio
import json
import logging
import os
import time
from typing import AsyncGenerator, Callable, Dict, List, Optional, Set, Tuple

from google.adk.agents import LlmAgent, ParallelAgent, SequentialAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import PrivateAttr

from app.jury.aggregate import parse_verdict
from app.jury.case import Case
from app.jury.models import CheckpointName, FmtMode, JurorSpec, JurorVerdict, Rubric, load_rubric
from app.jury.roster import family_of
from app.llm import (
    BLOCKED_MODELS,
    DEFAULT_OLLAMA_HOST,
    GroqClient,
    clean_thinking,
    get_ollama_host,
    is_model_blocked,
    mark_model_blocked,
)

JUROR_ERROR = "JUROR_ERROR:"
logger = logging.getLogger(__name__)

JUROR_INSTRUCTION = """You are an independent juror reviewing a software architecture generator's work.
Judge ONLY from the case below. Be strict and literal. Do not assume facts that are not written.
IMPORTANT: Reply in ENGLISH only. Do not output any text in other languages.

For each question answer "yes" or "no".
- "yes" means the check passes.
- "no" means it fails, and you MUST list the IDs that prove it in "cite" (only IDs that appear in the case).
  A "no" without valid IDs is ignored.

Output ONLY valid JSON — no commentary, no preamble, no markdown fences:
{"answers": [{"item": "<question id>", "verdict": "yes" | "no", "cite": ["<ID>", ...], "reason": "<one short sentence in English>"}]}

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
    logger.error(f"Juror model error: {type(error).__name__}: {error}", exc_info=True)
    msg = f"{JUROR_ERROR} {type(error).__name__}: {str(error)[:300]}"
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=msg)]))


def _build_litellm(
    model_name: str,
    *,
    api_key: Optional[str] = None,
    timeout: int = 90,
    fmt: FmtMode = "json",
    force_no_fmt: bool = False,
    num_ctx: Optional[int] = None,
    api_base: Optional[str] = None,
    reasoning_off: bool = False,
    think_flag: Optional[bool] = None,
) -> LiteLlm:
    """Central factory for LiteLlm model objects so all configuration decisions live in one place.

    Args:
        model_name:    Full LiteLLM model route (e.g. "groq/qwen/qwen3.8-27b").
        api_key:       Provider API key (None → let LiteLLM read from env).
        timeout:       Request timeout in seconds.
        fmt:           Output format hint from JurorSpec.
        force_no_fmt:  Override: skip response_format even for "json" fmt models (retry path).
        num_ctx:       Ollama context window.
        api_base:      Ollama host URL.
        reasoning_off: If True, pass extra_body={"reasoning_effort": "none"} to disable CoT on Groq.
        think_flag:    If False, pass reasoning_effort="none" (Ollama: think:false) for thinking models.
    """
    kwargs: Dict = {}

    if api_base is not None:
        # Ollama path
        kwargs["api_base"] = api_base
        if num_ctx is not None:
            kwargs["num_ctx"] = num_ctx
        if think_flag is False:
            kwargs["extra_body"] = {"reasoning_effort": "none"}
        elif fmt == "no_think":
            kwargs["extra_body"] = {"reasoning_effort": "none"}
        kwargs["format"] = "json" if (fmt == "json" and not force_no_fmt) else None
        if kwargs.get("format") is None:
            kwargs.pop("format", None)
    else:
        # Cloud path (Groq / OmniKey / Gemini)
        kwargs["max_tokens"] = 4096
        use_json_format = (fmt == "json") and not force_no_fmt
        if use_json_format:
            kwargs["response_format"] = {"type": "json_object"}

        if reasoning_off or fmt == "no_think":
            # Groq's correct parameter to disable Qwen3/DeepSeek-R1 thinking
            kwargs["extra_body"] = {"reasoning_effort": "none"}
        elif "gpt-oss" in model_name.lower():
            kwargs["extra_body"] = {"reasoning_effort": "low"}

    if api_key:
        kwargs["api_key"] = api_key

    return LiteLlm(model=model_name, timeout=timeout, **kwargs)


class AdkJuryPanel:
    def __init__(
        self,
        rubric: Optional[Rubric] = None,
        ollama_host: Optional[str] = None,
        is_cloud: bool = False,
        api_keys: Optional[Dict[str, str]] = None,
    ):
        self.is_cloud = is_cloud
        self.api_keys = api_keys or {}
        if rubric is not None:
            self.rubric = rubric
        else:
            available_providers = {k.lower() for k, v in self.api_keys.items() if v}
            raw_rubric = load_rubric()
            self.rubric = (
                raw_rubric.for_mode(is_cloud, available_providers=available_providers)
                if hasattr(raw_rubric, "for_mode")
                else raw_rubric
            )
        self.host = ollama_host or get_ollama_host()

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

    def _agent(
        self, checkpoint: CheckpointName, idx: int, spec: JurorSpec, case: Case, force_no_fmt: bool = False
    ) -> LlmAgent:
        ids = ", ".join(it.id for it in self.rubric.checkpoints[checkpoint].items)
        prompt = (
            JUROR_INSTRUCTION + case.text
            + f"\n\nAnswer EVERY question ({ids}), one entry each, in the JSON format above."
            + (f"\n{spec.prompt_suffix}" if spec.prompt_suffix else "")
        )

        if self.is_cloud or (spec.provider and spec.provider != "ollama"):
            prov = (spec.provider or "groq").lower()

            if prov == "groq":
                key = (self.api_keys.get("groq") or os.getenv("GROQ_API_KEY") or os.getenv("groq") or "").strip().strip("\"'")
                if key:
                    os.environ["GROQ_API_KEY"] = key
                model_name = f"groq/{spec.model}" if not spec.model.startswith("groq/") else spec.model
                model = _build_litellm(
                    model_name,
                    api_key=key or None,
                    timeout=90,
                    fmt=spec.fmt,
                    force_no_fmt=force_no_fmt,
                    reasoning_off=(spec.fmt == "no_think"),
                )

            elif prov in ("omnikey", "gemini"):
                key = (self.api_keys.get("omnikey") or os.getenv("OMNIKEY_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("omnikey") or "").strip().strip("\"'")
                if key:
                    os.environ["GEMINI_API_KEY"] = key
                model_name = f"gemini/{spec.model}" if not spec.model.startswith("gemini/") else spec.model
                model = _build_litellm(
                    model_name,
                    api_key=key or None,
                    timeout=90,
                    fmt=spec.fmt,
                    force_no_fmt=force_no_fmt,
                )

            else:
                # Unknown cloud provider — try bare model name, let LiteLLM route it
                model = _build_litellm(
                    spec.model,
                    timeout=90,
                    fmt=spec.fmt,
                    force_no_fmt=force_no_fmt,
                )

        else:
            # Ollama (local)
            model = _build_litellm(
                f"ollama_chat/{spec.model}",
                timeout=self.rubric.ollama.timeout_s,
                fmt=spec.fmt,
                force_no_fmt=force_no_fmt,
                num_ctx=self.rubric.ollama.num_ctx,
                api_base=self.host,
                think_flag=spec.think,
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
        concurrency = 1 if self.is_cloud else max(1, self.rubric.ollama.max_concurrent)
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

        verdicts: Dict[str, JurorVerdict] = {}
        blocked_models: Set[str] = set(BLOCKED_MODELS)
        used_replacements: Set[str] = set()
        message = types.Content(role="user", parts=[types.Part(text="Deliver your verdict as JSON.")])

        def _pick_replacement(cur_model: str, prefer_unused: bool = True) -> Optional[JurorSpec]:
            candidates = list(self.rubric.spares or []) + list(self.rubric.jurors or [])
            if self.is_cloud:
                candidates.extend([
                    JurorSpec(model="openai/gpt-oss-20b", family="openai", provider="groq", fmt="json"),
                    JurorSpec(model="openai/gpt-oss-120b", family="openai", provider="groq", fmt="json"),
                ])
            cur_low = cur_model.lower()
            eligible = [
                cand for cand in candidates
                if not cand.skip and not is_model_blocked(cand.model) and cand.model.lower() not in blocked_models
            ]
            if prefer_unused:
                for cand in eligible:
                    low = cand.model.lower()
                    if low != cur_low and low not in used_replacements:
                        return cand
            for cand in eligible:
                if cand.model.lower() != cur_low:
                    return cand
            return eligible[0] if eligible else None

        async def _direct_cloud_fallback(
            checkpoint: CheckpointName, seat: str, spec: JurorSpec, case: Case
        ) -> Optional[JurorVerdict]:
            if not self.is_cloud:
                return None
            prov = (spec.provider or "groq").lower()
            groq_key = (
                self.api_keys.get("groq")
                or os.getenv("GROQ_API_KEY")
                or os.getenv("groq")
                or ""
            ).strip().strip("\"'")
            if prov != "groq" or not groq_key:
                return None
            model_id = spec.model
            if is_model_blocked(model_id) or model_id.lower() in blocked_models:
                rep = _pick_replacement(model_id)
                model_id = rep.model if rep else "openai/gpt-oss-20b"
            model_id = model_id.removeprefix("groq/")
            cp = self.rubric.checkpoints[checkpoint]
            ids = ", ".join(it.id for it in cp.items)
            prompt = (
                JUROR_INSTRUCTION + case.text
                + f"\n\nAnswer EVERY question ({ids}), one entry each, in the JSON format above."
            )
            t1 = time.monotonic()
            try:
                gc = GroqClient(api_key=groq_key, model=model_id)
                res = await asyncio.to_thread(
                    gc.generate_json,
                    system_prompt="You are an independent architecture reviewer. Output valid JSON only.",
                    user_prompt=prompt,
                    target_schema=None,
                    temperature=0.0,
                    max_tokens=4096,
                )
                raw_json = json.dumps(res) if isinstance(res, (dict, list)) else str(res)
                used_model = gc.active_model
                used_spec = JurorSpec(
                    model=used_model,
                    family=family_of(used_model),
                    provider="groq",
                    fmt="json",
                )
                v = parse_verdict(raw_json, cp, case, seat, used_spec, seconds=round(time.monotonic() - t1, 1))
                return v if v.ok else None
            except Exception as fb_err:
                logger.warning(f"{checkpoint}: {seat} direct GroqClient fallback failed: {fb_err}")
                return None

        async def _run_juror(n: int, model_name: str, agents: List[LlmAgent]) -> None:
            async with gate:
                current_spec: Optional[JurorSpec] = None
                for agent in agents:
                    if agent.name in verdicts:
                        continue
                    checkpoint, (seat, spec, case) = by_name[agent.name]
                    cp = self.rubric.checkpoints[checkpoint]
                    idx = int(agent.name.split("_")[1])
                    force_no_fmt = False
                    if current_spec is not None and current_spec.model != spec.model:
                        spec = current_spec
                        agent = self._agent(checkpoint, idx, spec, case, force_no_fmt=force_no_fmt)
                    elif is_model_blocked(spec.model) or spec.model.lower() in blocked_models:
                        replacement = _pick_replacement(spec.model)
                        if replacement:
                            current_spec = spec = replacement
                            used_replacements.add(replacement.model.lower())
                            agent = self._agent(checkpoint, idx, spec, case, force_no_fmt=force_no_fmt)

                    last_failed_verdict: Optional[JurorVerdict] = None
                    for attempt in range(4):
                        runner = InMemoryRunner(agent=agent, app_name="arcgen_jury")
                        t0 = time.monotonic()
                        retry = False
                        try:
                            session = await runner.session_service.create_session(app_name="arcgen_jury", user_id="arcgen")
                            got_response = False
                            async for event in runner.run_async(user_id="arcgen", session_id=session.id, new_message=message):
                                if not event.is_final_response():
                                    continue
                                got_response = True
                                seconds = round(time.monotonic() - t0, 1)
                                parts = event.content.parts if event.content and event.content.parts else []
                                # Prefer non-thought parts; fall back to all text parts
                                text = "".join(p.text for p in parts if p.text and not getattr(p, "thought", False))
                                if not text.strip():
                                    text = "".join(p.text for p in parts if p.text)
                                if not text.strip() and getattr(event, "error_message", None):
                                    text = f"{JUROR_ERROR} {event.error_message}"
                                # Strip thinking tags from reasoning models
                                text = clean_thinking(text)
                                if text.startswith(JUROR_ERROR):
                                    err_str = text[len(JUROR_ERROR):].strip()
                                    err_low = err_str.lower()
                                    # Blocked / decommissioned / 403 / 404: mark blocked and swap immediately
                                    if any(k in err_low for k in (
                                        "blocked", "permission", "403", "not_found", "404",
                                        "model_permission_blocked_org", "model_decommissioned", "decommissioned",
                                    )):
                                        mark_model_blocked(spec.model)
                                        blocked_models.add(spec.model.lower())
                                        if attempt < 3:
                                            replacement = _pick_replacement(spec.model)
                                            if replacement:
                                                logger.warning(
                                                    f"{agent.name} ({spec.model}) blocked/unavailable ({err_str[:100]}); "
                                                    f"swapping to {replacement.model}..."
                                                )
                                                current_spec = spec = replacement
                                                used_replacements.add(replacement.model.lower())
                                                force_no_fmt = False
                                                agent = self._agent(checkpoint, idx, spec, case, force_no_fmt=force_no_fmt)
                                                await asyncio.sleep(0.5)
                                                retry = True
                                                break
                                    # Rate limit: swap to an unblocked spare or back off and retry
                                    if attempt < 3 and any(k in err_low for k in ("429", "rate_limit", "tpm", "rpm")):
                                        replacement = _pick_replacement(spec.model)
                                        if replacement and replacement.model.lower() != spec.model.lower():
                                            logger.info(f"{agent.name} ({spec.model}) hit rate limit; swapping to {replacement.model}...")
                                            current_spec = spec = replacement
                                            used_replacements.add(replacement.model.lower())
                                            force_no_fmt = False
                                            agent = self._agent(checkpoint, idx, spec, case, force_no_fmt=force_no_fmt)
                                            await asyncio.sleep(0.5)
                                        else:
                                            logger.info(f"{agent.name} hit rate limit, waiting 5s before retry...")
                                            await asyncio.sleep(5)
                                        retry = True
                                        break
                                    # Bad request / response_format rejected: retry without it
                                    if attempt < 3 and not force_no_fmt and any(k in err_low for k in (
                                        "400", "bad_request", "response_format", "json_object", "json_validate_failed", "unsupported",
                                    )):
                                        logger.info(f"{agent.name} hit format error, retrying without response_format...")
                                        force_no_fmt = True
                                        agent = self._agent(checkpoint, idx, spec, case, force_no_fmt=True)
                                        await asyncio.sleep(0.5)
                                        retry = True
                                        break
                                    last_failed_verdict = JurorVerdict(
                                        juror=seat, model=spec.model, family=spec.family,
                                        ok=False, error=err_str, seconds=seconds,
                                    )
                                    break

                                v = parse_verdict(text, cp, case, seat, spec, seconds=seconds)
                                if v.ok:
                                    verdicts[agent.name] = v
                                    on_verdict(checkpoint, v)
                                    break
                                if not force_no_fmt and attempt < 3:
                                    logger.info(f"{agent.name} ({spec.model}) returned unparseable output; retrying without response_format...")
                                    force_no_fmt = True
                                    agent = self._agent(checkpoint, idx, spec, case, force_no_fmt=True)
                                    await asyncio.sleep(0.5)
                                    retry = True
                                    break
                                last_failed_verdict = v
                                break

                            if agent.name in verdicts or not retry:
                                if not got_response and attempt < 3 and agent.name not in verdicts and last_failed_verdict is None:
                                    await asyncio.sleep(1)
                                    continue
                                break
                        except Exception as e:
                            logger.error(f"Juror {n} ({model_name}) agent {agent.name} failed: {e}", exc_info=True)
                            last_failed_verdict = JurorVerdict(
                                juror=seat, model=spec.model, family=spec.family,
                                ok=False, error=str(e)[:300], seconds=round(time.monotonic() - t0, 1),
                            )
                            if attempt < 3:
                                await asyncio.sleep(2)
                        finally:
                            await runner.close()

                    if agent.name not in verdicts:
                        fb_v = await _direct_cloud_fallback(checkpoint, seat, spec, case)
                        if fb_v is not None:
                            current_spec = JurorSpec(
                                model=fb_v.model, family=fb_v.family, provider="groq", fmt="json"
                            )
                            used_replacements.add(fb_v.model.lower())
                            verdicts[agent.name] = fb_v
                            on_verdict(checkpoint, fb_v)
                        elif last_failed_verdict is not None:
                            logger.warning(f"{checkpoint}: {seat} ({last_failed_verdict.model}) abstained: {last_failed_verdict.error}")
                            verdicts[agent.name] = last_failed_verdict
                            on_verdict(checkpoint, last_failed_verdict)

        tasks = [
            _run_juror(n, model, agents)
            for n, (model, agents) in enumerate(per_model.items(), 1)
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

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
