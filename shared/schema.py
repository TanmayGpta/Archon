from pydantic import BaseModel, Field
from typing import List

class Layer(BaseModel):
    name: str = Field(description="The name of the architectural layer (e.g., 'Presentation', 'Business Logic', 'Data Access')")
    description: str = Field(description="A brief description of the layer's responsibilities")

class DependencyRule(BaseModel):
    source_layer: str = Field(description="The name of the layer making the call")
    target_layer: str = Field(description="The name of the layer being called")
    allowed: bool = Field(description="Whether this dependency is allowed according to the architecture")
    reason: str = Field(description="The reason why this dependency is allowed or forbidden")

class ArchitectureRuleset(BaseModel):
    layers: List[Layer] = Field(description="The list of layers in the architecture")
    rules: List[DependencyRule] = Field(description="The explicit allowed/forbidden dependency rules between layers")
