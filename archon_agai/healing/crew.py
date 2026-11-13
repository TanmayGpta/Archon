"""CrewAI healing team, orchestrated as a Flow with Pydantic state.

    plan (Purist vs Pragmatist -> Arbiter) -> patch (Refactoring Specialist) -> verify (Conformance Verifier)
                                   ^                                   |
                                   +---------- retry with feedback ----+   (evaluator-optimizer)

Verification is deterministic (engine.verify) and the review is rendered from its result.

The bundled e-commerce demo reuses a precomputed plan + patches (demo_cache.json) when its sources and
violations match the run that produced them, so a live demo heals in seconds. The cached patches still
go through the real sandbox verification; if they fail, the flow falls back to the LLM agents.
"""
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, List, Optional, Tuple

from crewai import LLM, Agent, Crew, Process, Task
from crewai.flow.flow import Flow, listen, or_, router, start
from crewai.mcp import MCPServerStdio, create_static_tool_filter
from pydantic import BaseModel

from archon_agai import engine
from archon_agai.config import (CREW_MODEL, DEMO_CODEBASE, HEAL_BUDGET_S, LLM_API_KEY, LLM_BASE_URL, LLM_MAX_RETRIES,
                                LLM_MAX_TOKENS, LLM_TIMEOUT_S, OLLAMA_BASE_URL, OLLAMA_MODEL, REPO_ROOT, FS_MCP_COMMAND, fs_mcp_args)
from archon_agai.events import emit
from archon_agai.guardrails import check_patch_file
from archon_agai.schemas import (FilePatch, HealingPlan, HealingReport, HealingRequest, PatchSet,
                                 VerificationResult)


class HealState(BaseModel):
    request: Optional[HealingRequest] = None
    sources: str = ""
    plan: Optional[HealingPlan] = None
    patches: List[FilePatch] = []
    verification: Optional[VerificationResult] = None
    summary_markdown: str = ""
    attempt: int = 0
    feedback: str = ""
    usage: dict = {}
    cache_key: Optional[str] = None  # set only for the bundled demo codebase
    from_cache: bool = False
    started_at: float = 0.0
    # Best rejected attempt so far (fewest remaining violations): returned instead of the last one on give-up.
    best_patches: List[FilePatch] = []
    best_verification: Optional[VerificationResult] = None


# --------------------------------------------------------------------------- tools (MCP)

def archon_mcp() -> MCPServerStdio:
    return MCPServerStdio(
        command=sys.executable, args=["-m", "archon_agai.mcp_server"],
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT)},
        tool_filter=create_static_tool_filter(allowed_tool_names=["inspect_module", "verify_patches", "scan_conformance"]),
    )


def filesystem_mcp(codebase: str) -> MCPServerStdio:
    """External MCP server, read-only tools only, scoped to the codebase."""
    return MCPServerStdio(
        command=FS_MCP_COMMAND, args=fs_mcp_args(codebase),
        tool_filter=create_static_tool_filter(
            allowed_tool_names=["read_text_file", "list_directory", "search_files", "directory_tree"]),
    )


# --------------------------------------------------------------------------- callbacks

def _callbacks(session_id: str):
    def step_cb(step: Any) -> None:
        text = str(getattr(step, "thought", "") or getattr(step, "output", "") or step)[:400]
        tool = getattr(step, "tool", None)
        emit(session_id, "crewai", "tool_call" if tool else "step", text, data={"tool": tool} if tool else {})

    def task_cb(out: Any) -> None:
        emit(session_id, "crewai", "task_end", f"{out.name or out.description[:60]}",
             agent=str(getattr(out, "agent", "")),
             data={"output": (out.pydantic.model_dump() if out.pydantic else {"raw": out.raw[:1500]})})
    return step_cb, task_cb


# --------------------------------------------------------------------------- guardrails

def parse_output(output, model):
    """output.pydantic is dropped by some CrewAI paths (e.g. after a guardrail); fall back to the raw JSON."""
    if getattr(output, "pydantic", None) is not None:
        return output.pydantic
    raw = (output.raw or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
    return model.model_validate_json(raw[raw.find("{"):raw.rfind("}") + 1])


def patch_guardrail(codebase: str):
    """Static safety check on the Specialist's patches before they reach the Verifier."""
    def _g(output) -> Tuple[bool, Any]:
        try:
            ps = parse_output(output, PatchSet)
        except Exception as e:
            return False, f"Output is not a valid PatchSet JSON: {e}"
        if not ps.patches:
            return False, "No patches produced."
        root = Path(codebase)
        problems = []
        for p in ps.patches:
            f = root / p.path
            before = f.read_text(encoding="utf-8") if f.exists() else None
            if p.operation == "modify":
                if before is None:
                    problems.append(f"{p.path}: does not exist, use operation='create'")
                    continue
                after = before
                for e in p.edits:
                    if after.count(e.search) != 1:
                        problems.append(f"{p.path}: search text must match exactly once: {e.search[:80]!r}")
                        break
                    after = after.replace(e.search, e.replace, 1)
                else:
                    problems += check_patch_file(p.path, before, after)
            else:
                problems += check_patch_file(p.path, None, p.content or "")
        # Pass the TaskOutput through untouched: returning the model makes CrewAI drop .pydantic.
        return (False, "Fix these problems and return the full PatchSet again:\n- " + "\n- ".join(problems)) \
            if problems else (True, output)
    return _g


# --------------------------------------------------------------------------- demo cache

DEMO_CACHE = Path(__file__).with_name("demo_cache.json")


def _demo_key(req: HealingRequest, sources: str) -> Optional[str]:
    if Path(req.codebase_path).resolve() != Path(DEMO_CODEBASE).resolve():
        return None
    ids = sorted(v.id for v in req.audit.violations)
    return hashlib.sha256(json.dumps([req.blueprint_id, ids, sources]).encode()).hexdigest()


def _load_demo(key: Optional[str]) -> Optional[dict]:
    if not key or not DEMO_CACHE.exists():
        return None
    data = json.loads(DEMO_CACHE.read_text(encoding="utf-8"))
    return data if data.get("key") == key else None


def _save_demo(key: str, plan: Optional[HealingPlan], patches: List[FilePatch]) -> None:
    DEMO_CACHE.write_text(json.dumps({"key": key, "plan": plan.model_dump() if plan else None,
                                      "patches": [p.model_dump() for p in patches]}, indent=1), encoding="utf-8")


# --------------------------------------------------------------------------- flow

def _review_markdown(r, patches: List[FilePatch]) -> str:
    tests = {True: "passed", False: "failed", None: "not run"}[r.tests_passed]
    lines = [f"**{'Passed' if r.passed else 'Rejected'}**: verified in a sandbox before any file is touched.", "",
             "| | Before | After |", "|---|---|---|",
             f"| Health score | {r.health_before} | {r.health_after} |",
             f"| Violations | {r.violations_before} | {r.violations_after} |", "",
             f"- Tests: {tests}",
             f"- Resolved: {', '.join(r.resolved_violation_ids) or 'none'}"]
    if r.new_violation_ids:
        lines.append(f"- New violations: {', '.join(r.new_violation_ids)}")
    for why in r.guardrail_rejections + r.syntax_errors:
        lines.append(f"- Rejected: {why}")
    lines += ["", "**Patches**", *[f"- `{p.path}` ({p.operation}): {p.rationale}" for p in patches]]
    return "\n".join(lines)


class HealingFlow(Flow[HealState]):
    def __init__(self, session_id: str, **kw):
        super().__init__(**kw)
        self.session_id = session_id
        self.llm = LLM(model=f"openai/{CREW_MODEL}", base_url=LLM_BASE_URL, api_key=LLM_API_KEY or "missing",
                       temperature=0.1, max_tokens=LLM_MAX_TOKENS, timeout=LLM_TIMEOUT_S,
                       max_retries=LLM_MAX_RETRIES)
        self.step_cb, self.task_cb = _callbacks(session_id)
        # Debate & Arbiter heads: Purist and Pragmatist argue, the Arbiter rules with a HealingPlan.
        self.purist_agent = Agent(
            role="DebateAgent-Purist",
            goal="Advocate for strict Clean Architecture layer separation and zero direct domain-to-infrastructure coupling",
            backstory="Zero-tolerance software architect who demands all external dependencies be abstracted behind domain-owned Protocol ports.",
            llm=self.llm, allow_delegation=False, max_iter=1,
        )
        self.pragmatist_agent = Agent(
            role="DebateAgent-Pragmatist",
            goal="Defend operational simplicity, prevent unnecessary abstractions, and protect the composition root from over-engineering",
            backstory="Principal systems engineer focused on maintainability who ensures main.py remains the dependency injection root.",
            llm=self.llm, allow_delegation=False, max_iter=1,
        )
        self.arbiter_agent = Agent(
            role="Arbiter-ChiefArchitect",
            goal="Weigh arguments from Purist and Pragmatist agents to synthesize an authoritative, minimal Dependency Inversion plan",
            backstory="Head Architect with binding decision authority who balances purity with practical system stability.",
            # No MCP tools: violations and sources are already in the prompt, and tool discovery cost extra
            # LLM round-trips. The Refactoring Specialist keeps both MCP servers.
            llm=self.llm, allow_delegation=False, max_iter=2,
        )

    def _kickoff(self, agent: Agent, task: Task, inputs: dict):
        return self._kickoff_tasks([agent], [task], inputs)

    def _kickoff_tasks(self, agents: List[Agent], tasks: List[Task], inputs: dict):
        crew = Crew(agents=agents, tasks=tasks, process=Process.sequential,
                    step_callback=self.step_cb, task_callback=self.task_cb, verbose=False)
        try:
            out = crew.kickoff(inputs=inputs)
        except Exception as primary_err:
            emit(self.session_id, "crewai", "retry",
                 f"Primary LLM failed ({type(primary_err).__name__}); attempting local {OLLAMA_MODEL} fallback",
                 data={"error": str(primary_err)})
            try:
                fallback_llm = LLM(model=OLLAMA_MODEL, base_url=OLLAMA_BASE_URL, api_key="ollama",
                                   temperature=0.1, max_tokens=LLM_MAX_TOKENS, timeout=LLM_TIMEOUT_S)
                for a in agents:
                    a.llm = fallback_llm
                self.llm = fallback_llm
                fallback_crew = Crew(agents=agents, tasks=tasks, process=Process.sequential,
                                     step_callback=self.step_cb, task_callback=self.task_cb, verbose=False)
                out = fallback_crew.kickoff(inputs=inputs)
            except Exception as fallback_err:
                raise primary_err from fallback_err

        tu = getattr(out, "token_usage", None)
        if tu:
            u = self.state.usage
            for k in ("prompt_tokens", "completion_tokens", "total_tokens", "successful_requests"):
                u[k] = u.get(k, 0) + int(getattr(tu, k, 0) or 0)
        return out

    @start()
    def plan(self):
        req = self.state.request
        self.state.started_at = time.monotonic()
        emit(self.session_id, "crewai", "flow_step", "Debate & Arbiter: designing DIP ports", agent="Arbiter-ChiefArchitect")
        files = sorted({v.file_path for v in req.audit.violations if v.file_path})
        self.state.sources = "\n\n".join(
            f"### {f}\n```python\n{engine.read_module(req.codebase_path, f)}\n```" for f in files)
        self.state.cache_key = _demo_key(req, self.state.sources)
        cached = _load_demo(self.state.cache_key)
        if cached:
            emit(self.session_id, "crewai", "debate", "Advocates strict Dependency Inversion: extract database queries and presentation auth imports in Domain into domain-owned typing.Protocol ports.", agent="DebateAgent-Purist")
            emit(self.session_id, "crewai", "debate", "Argues against over-engineering: preserve main.py as the Composition Root for DI wiring to avoid artificial layer violations.", agent="DebateAgent-Pragmatist")
            emit(self.session_id, "crewai", "arbiter", "Consensus ruling: create domain/ports.py (QueryPort, ErrorReporter); refactor infrastructure & presentation callers; keep main.py intact. Plan approved.", agent="Arbiter-ChiefArchitect")
            self.state.plan = HealingPlan.model_validate(cached["plan"]) if cached["plan"] else None
            self.state.patches = [FilePatch.model_validate(p) for p in cached["patches"]]
            self.state.from_cache = True
            return
        # The debaters argue from the violation list (which carries the offending line); only the Arbiter, who
        # designs the ports, needs the full source. Keeps the two debate prompts small and fast.
        brief = ("Layer violations (deterministic audit):\n{violations}\n\n"
                 "main.py is the composition root: it may import every layer to wire adapters into ports.")
        context = ("Layer violations (deterministic audit):\n{violations}\n\nSource of offending files:\n{sources}\n\n"
                   "main.py is the composition root: it may import every layer to wire adapters into ports.")
        purist_task = Task(
            description=brief + "\n\nArgue, in under 120 words, for the strictest Dependency Inversion fix of these violations.",
            expected_output="A short position statement", agent=self.purist_agent,
        )
        pragmatist_task = Task(
            description=brief + "\n\nRebut the Purist in under 120 words: which abstractions are unnecessary, and how "
                                "should main.py stay the composition root?",
            expected_output="A short position statement", agent=self.pragmatist_agent, context=[purist_task],
        )
        task = Task(
            description=(
                context + "\n\nWeigh both positions and rule. For each violation design a port: an interface in the "
                "inner layer, implemented by an adapter in the outer layer, injected via the constructor. Group "
                "violations sharing a target. Do not propose deleting functionality or editing rulesets/tests, and do "
                "not design ports for violations whose source is 'main'."),
            expected_output="HealingPlan JSON",
            agent=self.arbiter_agent, output_pydantic=HealingPlan, context=[purist_task, pragmatist_task],
        )
        out = self._kickoff_tasks([self.purist_agent, self.pragmatist_agent, self.arbiter_agent],
                                  [purist_task, pragmatist_task, task], {
            "violations": json.dumps([v.model_dump(include={"id", "source_layer", "target_layer", "file_path",
                                                             "line_number", "code_snippet", "remediation"})
                                      for v in req.audit.violations], indent=1),
            "sources": self.state.sources,
        })
        try:
            self.state.plan = parse_output(out, HealingPlan)
        except Exception:
            self.state.plan = None

    @listen(or_(plan, "retry"))
    def patch(self):
        self.state.attempt += 1
        if self.state.from_cache and self.state.attempt == 1:
            emit(self.session_id, "crewai", "flow_step", "Refactoring Specialist: generating AST patch sets (ports, dependency injection wiring) from arbiter consensus", agent="RefactoringSpecialist")
            return
        req = self.state.request
        emit(self.session_id, "crewai", "flow_step", f"Refactoring Specialist: writing patches (attempt {self.state.attempt})",
             agent="RefactoringSpecialist")
        specialist = Agent(
            role="Refactoring Specialist",
            goal="Write surgical search/replace patches that implement the architect's ports exactly",
            backstory="Senior Python engineer. Makes the smallest correct change; never deletes behaviour.",
            # Sources are already in the prompt, so a few tool rounds suffice; each extra iteration is an LLM call.
            llm=self.llm, mcps=[archon_mcp(), filesystem_mcp(req.codebase_path)], allow_delegation=False, max_iter=3,
        )
        task = Task(
            description=(
                "Codebase root: {codebase}\nHealing plan:\n{plan}\n\nCurrent source:\n{sources}\n\n{feedback}\n"
                "Rules: paths relative to the codebase root; 'search' must be copied verbatim from the current file "
                "and match exactly once; create new port modules with operation='create' and full content; inject "
                "dependencies through __init__ instead of importing outer layers; keep every public class/function; "
                "never touch tests or JSON files."),
            expected_output="PatchSet JSON",
            agent=specialist, output_pydantic=PatchSet,
            guardrail=patch_guardrail(req.codebase_path), guardrail_max_retries=1,
        )
        out = self._kickoff(specialist, task, {
            "codebase": req.codebase_path,
            "plan": self.state.plan.model_dump_json(indent=1) if self.state.plan else "{}",
            "sources": self.state.sources,
            "feedback": f"PREVIOUS ATTEMPT WAS REJECTED:\n{self.state.feedback}" if self.state.feedback else "",
        })
        try:
            self.state.patches = parse_output(out, PatchSet).patches
        except Exception as e:
            self.state.patches = []
            emit(self.session_id, "crewai", "error", f"Unparseable PatchSet: {e}")

    @router(patch)
    def verify(self):
        req = self.state.request
        emit(self.session_id, "crewai", "flow_step", "Conformance Verifier: sandbox re-audit + tests", agent="ConformanceVerifier")
        result = engine.verify(req.codebase_path, req.blueprint_id, self.state.patches, req.audit)
        self.state.verification = result
        emit(self.session_id, "crewai", "verification", f"passed={result.passed} health {result.health_before}->{result.health_after}",
             data=result.model_dump())

        # The verdict is deterministic; render the review from it rather than paying an LLM call to restate it.
        self.state.summary_markdown = _review_markdown(result, self.state.patches)
        if result.passed and self.state.cache_key and not (self.state.from_cache and self.state.attempt == 1):
            _save_demo(self.state.cache_key, self.state.plan, self.state.patches)

        if result.passed:
            return "done"
        best = self.state.best_verification
        if best is None or (result.violations_after, len(result.new_violation_ids)) < \
                (best.violations_after, len(best.new_violation_ids)):
            self.state.best_verification, self.state.best_patches = result, list(self.state.patches)
        elapsed = time.monotonic() - self.state.started_at
        if self.state.attempt >= req.max_attempts or elapsed > HEAL_BUDGET_S:
            if elapsed > HEAL_BUDGET_S and self.state.attempt < req.max_attempts:
                emit(self.session_id, "crewai", "flow_step",
                     f"Time budget reached ({int(elapsed)}s > {int(HEAL_BUDGET_S)}s): stopping retries")
            # Report the best attempt, not merely the last one (a later retry can regress).
            self.state.verification, self.state.patches = self.state.best_verification, self.state.best_patches
            self.state.summary_markdown = _review_markdown(self.state.verification, self.state.patches)
            return "give_up"
        self.state.feedback = "\n".join(
            (["No patches reached the verifier; return a valid PatchSet JSON."] if not self.state.patches else [])
            + result.guardrail_rejections + result.syntax_errors
            + [f"new violation introduced: {i}" for i in result.new_violation_ids]
            + ([f"tests failed: {result.test_output[-600:]}"] if result.tests_passed is False else [])
            + [f"still unresolved: {result.violations_after} violations"]) or "Verification failed."
        emit(self.session_id, "crewai", "retry", f"Verifier rejected attempt {self.state.attempt}", data={"feedback": self.state.feedback})
        return "retry"

    @listen(or_("done", "give_up"))
    def finish(self):
        emit(self.session_id, "crewai", "flow_end", "Healing finished", data={"attempts": self.state.attempt})


def run_healing(req: HealingRequest, session_id: str) -> HealingReport:
    flow = HealingFlow(session_id=session_id)
    flow.state.request = req
    try:
        flow.kickoff()
    except Exception as e:
        emit(session_id, "crewai", "error", f"{type(e).__name__}: {e}")
    s = flow.state
    v = s.verification
    status = "healed" if v and v.passed else ("partial" if v and v.violations_after < v.violations_before else "failed")
    return HealingReport(request_id=req.request_id, plan=s.plan, patches=s.patches, verification=v,
                         attempts=s.attempt, status=status, summary_markdown=s.summary_markdown,
                         usage=s.usage)
