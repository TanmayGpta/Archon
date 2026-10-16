"""CrewAI healing team, orchestrated as a Flow with Pydantic state.

    plan (Chief Architect) -> patch (Refactoring Specialist) -> verify (Conformance Verifier)
                                   ^                                   |
                                   +---------- retry with feedback ----+   (evaluator-optimizer)

Verification is deterministic (engine.verify); the Verifier agent explains it and a task
guardrail rejects any report that disagrees with the real result.
"""
import json
import os
import sys
from pathlib import Path
from typing import Any, List, Optional, Tuple

from crewai import LLM, Agent, Crew, Process, Task
from crewai.flow.flow import Flow, listen, or_, router, start
from crewai.mcp import MCPServerStdio, create_static_tool_filter
from pydantic import BaseModel

from archon_agai import engine
from archon_agai.config import (CREW_MODEL, FS_MCP_COMMAND, LLM_API_KEY, LLM_BASE_URL, LLM_MAX_TOKENS, REPO_ROOT,
                                fs_mcp_args)
from archon_agai.events import emit
from archon_agai.guardrails import check_patch_file
from archon_agai.schemas import (FilePatch, HealingPlan, HealingReport, HealingRequest, PatchSet,
                                 VerificationResult)


class VerifierReport(BaseModel):
    passed: bool
    summary_markdown: str


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

def patch_guardrail(codebase: str):
    """Static safety check on the Specialist's patches before they reach the Verifier."""
    def _g(output) -> Tuple[bool, Any]:
        try:
            ps = output.pydantic or PatchSet.model_validate_json(output.raw)
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
        return (False, "Fix these problems and return the full PatchSet again:\n- " + "\n- ".join(problems)) \
            if problems else (True, ps)
    return _g


# --------------------------------------------------------------------------- flow

class HealingFlow(Flow[HealState]):
    def __init__(self, session_id: str, **kw):
        super().__init__(**kw)
        self.session_id = session_id
        self.llm = LLM(model=f"openai/{CREW_MODEL}", base_url=LLM_BASE_URL, api_key=LLM_API_KEY or "missing",
                       temperature=0.1, max_tokens=LLM_MAX_TOKENS)
        self.step_cb, self.task_cb = _callbacks(session_id)

    def _crew(self, agent: Agent, task: Task) -> Crew:
        return Crew(agents=[agent], tasks=[task], process=Process.sequential,
                    step_callback=self.step_cb, task_callback=self.task_cb, verbose=False)

    def _kickoff(self, agent: Agent, task: Task, inputs: dict):
        out = self._crew(agent, task).kickoff(inputs=inputs)
        tu = getattr(out, "token_usage", None)
        if tu:
            u = self.state.usage
            for k in ("prompt_tokens", "completion_tokens", "total_tokens", "successful_requests"):
                u[k] = u.get(k, 0) + int(getattr(tu, k, 0) or 0)
        return out

    @start()
    def plan(self):
        req = self.state.request
        emit(self.session_id, "crewai", "flow_step", "Chief Architect: designing DIP ports", agent="ChiefArchitect")
        files = sorted({v.file_path for v in req.audit.violations if v.file_path})
        self.state.sources = "\n\n".join(
            f"### {f}\n```python\n{engine.read_module(req.codebase_path, f)}\n```" for f in files)
        architect = Agent(
            role="Chief Architect",
            goal="Design minimal Dependency Inversion ports that remove every layer violation without changing behaviour",
            backstory="Clean Architecture expert. Inner layers own interfaces (typing.Protocol); outer layers implement them.",
            llm=self.llm, mcps=[archon_mcp()], allow_delegation=False, max_iter=4,
        )
        task = Task(
            description=(
                "Layer violations (deterministic audit):\n{violations}\n\nSource of offending files:\n{sources}\n\n"
                "For each violation design a port: an interface in the inner layer, implemented by an adapter in the "
                "outer layer, injected via the constructor. Group violations sharing a target. Do not propose "
                "deleting functionality or editing rulesets/tests. main.py is the composition root: it may import "
                "every layer to wire adapters into ports, so do not design ports for violations whose source is 'main'."),
            expected_output="HealingPlan JSON",
            agent=architect, output_pydantic=HealingPlan,
        )
        out = self._kickoff(architect, task, {
            "violations": json.dumps([v.model_dump(include={"id", "source_layer", "target_layer", "file_path",
                                                             "line_number", "code_snippet", "remediation"})
                                      for v in req.audit.violations], indent=1),
            "sources": self.state.sources,
        })
        self.state.plan = out.pydantic

    @listen(or_(plan, "retry"))
    def patch(self):
        self.state.attempt += 1
        req = self.state.request
        emit(self.session_id, "crewai", "flow_step", f"Refactoring Specialist: writing patches (attempt {self.state.attempt})",
             agent="RefactoringSpecialist")
        specialist = Agent(
            role="Refactoring Specialist",
            goal="Write surgical search/replace patches that implement the architect's ports exactly",
            backstory="Senior Python engineer. Makes the smallest correct change; never deletes behaviour.",
            llm=self.llm, mcps=[archon_mcp(), filesystem_mcp(req.codebase_path)], allow_delegation=False, max_iter=6,
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
            guardrail=patch_guardrail(req.codebase_path), guardrail_max_retries=2,
        )
        out = self._kickoff(specialist, task, {
            "codebase": req.codebase_path,
            "plan": self.state.plan.model_dump_json(indent=1) if self.state.plan else "{}",
            "sources": self.state.sources,
            "feedback": f"PREVIOUS ATTEMPT WAS REJECTED:\n{self.state.feedback}" if self.state.feedback else "",
        })
        self.state.patches = out.pydantic.patches if out.pydantic else []

    @router(patch)
    def verify(self):
        req = self.state.request
        emit(self.session_id, "crewai", "flow_step", "Conformance Verifier: sandbox re-audit + tests", agent="ConformanceVerifier")
        result = engine.verify(req.codebase_path, req.blueprint_id, self.state.patches, req.audit)
        self.state.verification = result
        emit(self.session_id, "crewai", "verification", f"passed={result.passed} health {result.health_before}->{result.health_after}",
             data=result.model_dump())

        verifier = Agent(
            role="Conformance Verifier",
            goal="Report the deterministic verification result truthfully and explain it for a reviewer",
            backstory="QA lead. Trusts only the verification tool output, never opinions.",
            llm=self.llm, allow_delegation=False, max_iter=2,
        )

        def truthful(output) -> Tuple[bool, Any]:
            rep = output.pydantic
            if rep is None or rep.passed != result.passed:
                return False, f"Your 'passed' must equal the tool result ({result.passed})."
            return True, rep

        task = Task(
            description=("Verification result (ground truth):\n{result}\n\nPatches:\n{patches}\n\n"
                         "Write a concise Markdown review: a table of violations resolved/remaining, health score "
                         "before -> after, test status, and any rejection reasons."),
            expected_output="VerifierReport JSON", agent=verifier, output_pydantic=VerifierReport,
            guardrail=truthful, guardrail_max_retries=1,
        )
        out = self._kickoff(verifier, task, {
            "result": result.model_dump_json(indent=1),
            "patches": json.dumps([p.model_dump(include={"path", "operation", "rationale"}) for p in self.state.patches]),
        })
        self.state.summary_markdown = out.pydantic.summary_markdown if out.pydantic else out.raw

        if result.passed:
            return "done"
        if self.state.attempt >= req.max_attempts:
            return "give_up"
        self.state.feedback = "\n".join(
            result.guardrail_rejections + result.syntax_errors
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
