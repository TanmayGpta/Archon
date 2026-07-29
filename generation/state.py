from typing import TypedDict, Optional, Dict
from shared.schema import ArchitectureRuleset

class GenerationState(TypedDict):
    # Input
    srs_content: str
    
    # Analyst Outputs
    extracted_requirements: Optional[str]
    
    # Architect Outputs
    plantuml_diagram: Optional[str]
    ruleset: Optional[ArchitectureRuleset]
    
    # Evaluator Outputs
    feedback: Optional[str]
    
    # Loop control
    iterations: int
