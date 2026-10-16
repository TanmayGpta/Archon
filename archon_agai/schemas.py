"""Pydantic contracts shared by the ADK audit side, the CrewAI healing side and the gateway.

These models are the A2A payload format, the structured-output schemas for both
frameworks, and the shapes streamed to the frontend. Change them deliberately.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- audit (ADK side)

class Violation(BaseModel):
    id: str = Field(..., description="Stable id: '<source_module>-><target_module>'")
    source_module: str
    target_module: str
    source_layer: str
    target_layer: str
    severity: str
    reason: str
    file_path: Optional[str] = Field(None, description="Path of the offending file, relative to the codebase root")
    line_number: Optional[int] = None
    code_snippet: Optional[str] = None
    explanation: Optional[str] = None
    remediation: Optional[str] = None


class AuditMetrics(BaseModel):
    health_score: float = Field(..., ge=0, le=100)
    total_edges_checked: int = 0
    total_violations: int = 0
    total_cycles: int = 0


class AuditResult(BaseModel):
    """Deterministic ground truth produced by the Archon MCP server (never by an LLM)."""
    codebase: str
    blueprint_id: str
    metrics: AuditMetrics
    violations: List[Violation] = []
    cycles: List[List[str]] = []


class ViolationRationale(BaseModel):
    violation_id: str
    why_it_matters: str
    prescribed_fix: str


class AuditNarrative(BaseModel):
    """Structured output of the ADK ReportAgent (output_schema)."""
    summary: str
    rationales: List[ViolationRationale] = []
    roadmap: List[str] = Field(default_factory=list, description="Refactoring steps, highest severity first")


# --------------------------------------------------------------------------- healing (CrewAI side)

class SearchReplace(BaseModel):
    search: str = Field(..., description="Exact text currently in the file (must match once)")
    replace: str = Field(..., description="Replacement text")


class FilePatch(BaseModel):
    path: str = Field(..., description="File path relative to the codebase root, forward slashes")
    operation: Literal["modify", "create"] = "modify"
    edits: List[SearchReplace] = Field(default_factory=list, description="For 'modify'")
    content: Optional[str] = Field(None, description="Full file content, for 'create'")
    violation_ids: List[str] = Field(default_factory=list)
    rationale: str = ""


class PortDesign(BaseModel):
    """Chief Architect output: the Dependency Inversion ports to introduce."""
    port_name: str = Field(..., description="Interface/Protocol name, e.g. 'TransactionRepository'")
    port_module: str = Field(..., description="Module where the port lives (inner layer), e.g. 'domain/ports.py'")
    adapter_module: str = Field(..., description="Outer-layer module implementing it, e.g. 'infrastructure/database.py'")
    methods: List[str] = []
    resolves: List[str] = Field(default_factory=list, description="Violation ids this port resolves")


class HealingPlan(BaseModel):
    ports: List[PortDesign]
    notes: str = ""


class PatchSet(BaseModel):
    patches: List[FilePatch]


class VerificationResult(BaseModel):
    """Produced by the deterministic verify tool; the Verifier agent only reports it."""
    passed: bool
    health_before: float
    health_after: float
    violations_before: int
    violations_after: int
    resolved_violation_ids: List[str] = []
    new_violation_ids: List[str] = []
    syntax_errors: List[str] = []
    guardrail_rejections: List[str] = []
    tests_passed: Optional[bool] = None
    test_output: str = ""


class HealingReport(BaseModel):
    """Final A2A response from the CrewAI healing service."""
    request_id: str
    plan: Optional[HealingPlan] = None
    patches: List[FilePatch] = []
    verification: Optional[VerificationResult] = None
    attempts: int = 0
    status: Literal["healed", "partial", "failed"] = "failed"
    summary_markdown: str = ""
    usage: Dict[str, int] = {}


class HealingRequest(BaseModel):
    """A2A request payload ADK -> CrewAI."""
    request_id: str
    codebase_path: str
    blueprint_id: str
    audit: AuditResult
    max_attempts: int = 3


# --------------------------------------------------------------------------- monitoring

class AgentEvent(BaseModel):
    """One monitoring/trace event, emitted by callbacks and streamed to the UI over SSE."""
    session_id: str
    framework: Literal["adk", "crewai", "gateway", "a2a", "guardrail"]
    kind: str = Field(..., description="e.g. model_start, tool_start, tool_end, task_end, guardrail_block, error")
    agent: Optional[str] = None
    message: str = ""
    data: Dict[str, Any] = {}
    ts: str = Field(default_factory=_now)
