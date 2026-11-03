"""The ADK jury: one LlmAgent per juror (local Ollama via LiteLlm) under a ParallelAgent.

Independence:
- every juror gets its own case (shuffled order) through an InstructionProvider, so no juror
  sees another's case or verdict, and no session state is shared between them;
- include_contents="none": no conversation history leaks in;
- a juror that errors or times out abstains (on_model_error_callback) instead of failing the panel.

Ollama on a 6 GB GPU can hold one small model at a time, so model calls pass through a
semaphore (rubric.ollama.max_concurrent, default 1). The agents still run under ParallelAgent;
on bigger hardware raise max_concurrent and they really run side by side.
"""

import asyncio
import os
import time
from typing import AsyncGenerator, Callable, Dict, List, Optional, Tuple

from google.adk.agents import LlmAgent, ParallelAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import PrivateAttr

from app.jury.aggregate import parse_verdict
from app.jury.case import Case
from app.jury.models import CheckpointName, JurorSpec, JurorVerdict, Rubric, load_rubric

JUROR_ERROR = "JUROR_ERROR:"

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


class _ThrottledLiteLlm(LiteLlm):
    """LiteLlm whose calls wait on a shared semaphore (set per jury sitting)."""

    _gate: Optional[asyncio.Semaphore] = PrivateAttr(default=None)

    async def generate_content_async(self, llm_request, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        if self._gate is None:
            async for r in super().generate_content_async(llm_request, stream=stream):
                yield r
            return
        async with self._gate:
            async for r in super().generate_content_async(llm_request, stream=stream):
                yield r


def _on_model_error(callback_context, llm_request, error) -> LlmResponse:
    """Turn a failed juror call into an abstention instead of aborting the whole panel."""
    msg = f"{JUROR_ERROR} {type(error).__name__}: {str(error)[:300]}"
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=msg)]))


class AdkOllamaPanel:
    def __init__(self, rubric: Optional[Rubric] = None, ollama_host: Optional[str] = None):
        self.rubric = rubric or load_rubric()
        self.host = ollama_host or os.getenv("OLLAMA_HOST") or os.getenv("OLLAMA_URL") or "http://localhost:11434"

    def judge(
        self,
        checkpoint: CheckpointName,
        seats: List[Tuple[str, JurorSpec, Case]],
        on_verdict: Callable[[JurorVerdict], None],
    ) -> List[JurorVerdict]:
        # Called from the pipeline's worker thread, which has no running event loop.
        return asyncio.run(self._judge(checkpoint, seats, on_verdict))

    def _agent(self, checkpoint: CheckpointName, idx: int, spec: JurorSpec, case: Case, gate: asyncio.Semaphore) -> LlmAgent:
        ids = ", ".join(it.id for it in self.rubric.checkpoints[checkpoint].items)
        prompt = (
            JUROR_INSTRUCTION + case.text
            + f"\n\nAnswer EVERY question ({ids}), one entry each, in the JSON format above."
            + (f"\n{spec.prompt_suffix}" if spec.prompt_suffix else "")
        )
        model = _ThrottledLiteLlm(
            model=f"ollama_chat/{spec.model}",
            api_base=self.host,
            timeout=self.rubric.ollama.timeout_s,
            num_ctx=self.rubric.ollama.num_ctx,
            format="json",
        )
        model._gate = gate
        return LlmAgent(
            name=f"juror_{idx}",
            model=model,
            instruction=lambda _ctx, p=prompt: p,  # provider => no state templating, no sharing
            include_contents="none",
            generate_content_config=types.GenerateContentConfig(temperature=0.0),
            on_model_error_callback=_on_model_error,
        )

    async def _judge(self, checkpoint, seats, on_verdict) -> List[JurorVerdict]:
        cp = self.rubric.checkpoints[checkpoint]
        gate = asyncio.Semaphore(max(1, self.rubric.ollama.max_concurrent))
        agents = [self._agent(checkpoint, i, spec, case, gate) for i, (_, spec, case) in enumerate(seats, 1)]
        by_name: Dict[str, Tuple[str, JurorSpec, Case]] = {a.name: s for a, s in zip(agents, seats)}

        jury = ParallelAgent(name=f"jury_{checkpoint}", sub_agents=agents)
        runner = InMemoryRunner(agent=jury, app_name="arcgen_jury")
        session = await runner.session_service.create_session(app_name="arcgen_jury", user_id="arcgen")
        started = time.monotonic()
        verdicts: Dict[str, JurorVerdict] = {}

        message = types.Content(role="user", parts=[types.Part(text="Deliver your verdict as JSON.")])
        try:
            async for event in runner.run_async(user_id="arcgen", session_id=session.id, new_message=message):
                name = event.author
                if name not in by_name or name in verdicts or not event.is_final_response():
                    continue
                # Skip reasoning ("thought") parts from thinking models such as qwen3; keep the answer.
                parts = event.content.parts if event.content and event.content.parts else []
                text = "".join(p.text for p in parts if p.text and not getattr(p, "thought", False))
                seat, spec, case = by_name[name]
                if text.startswith(JUROR_ERROR):
                    v = JurorVerdict(juror=seat, model=spec.model, family=spec.family, ok=False,
                                     error=text[len(JUROR_ERROR):].strip(), seconds=round(time.monotonic() - started, 1))
                else:
                    v = parse_verdict(text, cp, case, seat, spec, seconds=time.monotonic() - started)
                verdicts[name] = v
                on_verdict(v)
        finally:
            await runner.close()

        out = []
        for a in agents:  # jurors that never answered abstain
            if a.name in verdicts:
                out.append(verdicts[a.name])
            else:
                seat, spec, _ = by_name[a.name]
                v = JurorVerdict(juror=seat, model=spec.model, family=spec.family, ok=False, error="no response")
                on_verdict(v)
                out.append(v)
        return out
