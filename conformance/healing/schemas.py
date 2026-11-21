"""Pydantic contracts for Phase 4 architectural healing (framework-free)."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class SearchReplace(BaseModel):
    """Exact search/replace block inside an existing file."""

    search: str = Field(..., description="Exact substring currently in the file (must match once)")
    replace: str = Field(..., description="Replacement text")


class FilePatch(BaseModel):
    """Single file modification or creation proposed by the healing planner/patcher."""

    path: str = Field(..., description="Relative POSIX path inside the target codebase")
    operation: Literal["modify", "create"] = "modify"
    edits: List[SearchReplace] = Field(default_factory=list, description="Required when operation='modify'")
    content: Optional[str] = Field(None, description="Full file content when operation='create'")
    violation_ids: List[str] = Field(default_factory=list)
    rationale: str = ""


class FileDiffPreview(BaseModel):
    """Full before/after content for IDE diff review before applying to workspace."""

    path: str
    name: str
    operation: Literal["modify", "create"]
    before: str
    after: str
    summary: str = ""


class PortDesign(BaseModel):
    """Dependency Inversion port/adapter design for resolving layer violations."""

    port_name: str = Field(..., description="Interface/Protocol class name, e.g. 'PatternCatalogPort'")
    port_module: str = Field(..., description="Target module path for the port, e.g. 'domain/ports.py'")
    adapter_module: str = Field(..., description="Infrastructure module implementing or bridging it")
    methods: List[str] = Field(default_factory=list)
    resolves: List[str] = Field(default_factory=list, description="Violation ids this port resolves")


class HealingPlan(BaseModel):
    """Planner output describing the ports and injection strategy."""

    ports: List[PortDesign] = Field(default_factory=list)
    notes: str = ""


class PatchSet(BaseModel):
    """Patch generator output containing one or more file patches."""

    patches: List[FilePatch] = Field(default_factory=list)


class VerificationResult(BaseModel):
    """Deterministic sandbox verification summary (never authored by an LLM)."""

    passed: bool
    health_before: float
    health_after: float
    violations_before: int
    violations_after: int
    resolved_violation_ids: List[str] = Field(default_factory=list)
    new_violation_ids: List[str] = Field(default_factory=list)
    syntax_errors: List[str] = Field(default_factory=list)
    guardrail_rejections: List[str] = Field(default_factory=list)
    tests_passed: Optional[bool] = None
    test_output: str = ""


class HealJobRequest(BaseModel):
    """API payload to start a background LangGraph healing job."""

    codebase_path: Optional[str] = Field(None, description="Codebase path (defaults to current IDE workspace)")
    blueprint_id: Optional[str] = Field("archon_architecture", description="Blueprint id or 'custom'")
    custom_ruleset: Optional[Dict[str, Any]] = None
    mode: Literal["single", "all"] = "single"
    violation_id: Optional[str] = Field(None, description="Required when mode='single' (source_module->target_module)")
    provider: Optional[str] = Field(None, description="groq | gemini | nvidia | openai | freellmapi; default = auto-detect")
    model: Optional[str] = Field(None, description="IDE model picker value (e.g. freellmapi:auto:fast, gpt-4.1, gemini-2.5-flash)")
    max_attempts: int = Field(3, ge=1, le=5)
    include_external: bool = True


class HealingReport(BaseModel):
    """Final healing job output delivered to the IDE for human approval."""

    status: Literal["healed", "partial", "failed"]
    codebase: str
    blueprint_id: str
    target_violation_ids: List[str] = Field(default_factory=list)
    skipped_violations: List[Dict[str, str]] = Field(default_factory=list)
    plan: Optional[HealingPlan] = None
    patches: List[FilePatch] = Field(default_factory=list)
    previews: List[FileDiffPreview] = Field(default_factory=list)
    verification: Optional[VerificationResult] = None
    attempts: int = 0
    summary: str = ""
