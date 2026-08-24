from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Literal

class Layer(BaseModel):
    name: str = Field(description="The formal name of the architectural layer (e.g., 'Domain', 'Infrastructure')")
    description: str = Field(description="Semantic description of the layer's responsibilities. Used by the LLM classifier.")
    match_patterns: Optional[List[str]] = Field(
        default=None, 
        description="Optional glob patterns (e.g., 'app/api/routes/*.py'). If a file matches this, bypasses LLM and assigns deterministically."
    )

class DependencyRule(BaseModel):
    source_layer: str = Field(description="The layer initiating the import/call")
    target_layer: str = Field(description="The layer being imported/called")
    type: Literal["allow", "forbid"] = Field(description="Whether this specific edge is allowed or explicitly forbidden")
    reason: str = Field(description="Documentation explaining why this rule exists")
    severity: Literal["critical", "major", "minor"] = Field(
        default="major",
        description="Severity assigned to a violation of this specific rule"
    )

class ArchitectureRuleset(BaseModel):
    version: str = Field(default="1.0", description="Schema version")
    project_name: str = Field(description="Name of the project this ruleset applies to")
    default_policy: Literal["default-deny", "default-allow"] = Field(
        default="default-deny",
        description="If default-deny, any dependency not explicitly 'allow'ed is a violation."
    )
    unclassified_policy: Literal["flag_for_review", "ignore"] = Field(
        default="flag_for_review",
        description="How to treat modules the classifier could not confidently assign to a layer"
    )
    layers: List[Layer] = Field(description="All defined layers in the system")
    rules: List[DependencyRule] = Field(description="The explicit relationship rules between layers")

    @model_validator(mode="after")
    def check_layer_references(self):
        layer_names = {l.name for l in self.layers}
        for r in self.rules:
            if r.source_layer not in layer_names or r.target_layer not in layer_names:
                raise ValueError(f"Rule references undefined layer: {r.source_layer} -> {r.target_layer}")
        return self
