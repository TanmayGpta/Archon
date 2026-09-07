from typing import Dict, List, Any, Optional, Tuple
import networkx as nx
from pydantic import BaseModel

class ArchitecturalViolation(BaseModel):
    source_module: str
    target_module: str
    source_layer: str
    target_layer: str
    severity: str
    reason: str
    line_number: Optional[int] = None
    code_snippet: Optional[str] = None
    explanation: Optional[str] = None
    remediation: Optional[str] = None

def get_xai_details(source_layer: str, target_layer: str, source_mod: str, target_mod: str) -> Tuple[str, str]:
    """Provides Explainable AI (XAI) architectural rationale and remediation advice."""
    s_clean = source_layer.lower()
    t_clean = target_layer.lower()

    if "presentation" in s_clean and "infrastructure" in t_clean:
        hazard = (
            "Direct Presentation-to-Infrastructure Coupling: The delivery/web layer directly queries or manages "
            "persistence/external clients. This bypasses enterprise business logic and use cases, makes mocking "
            "difficult during unit testing, and tightly binds web routes to specific database drivers."
        )
        fix = (
            f"Introduce or call an Application use-case in '{source_mod}'. Have the Presentation endpoint receive input, "
            f"delegate execution to the Application service, and serialize the result. '{source_mod}' should never directly "
            f"import '{target_mod}'."
        )
    elif "domain" in s_clean and "infrastructure" in t_clean:
        hazard = (
            "Domain Entity Contamination: Pure enterprise domain entities/rules are reaching into external infrastructure "
            "(databases, networks, or 3rd-party APIs). Domain models must remain pure and free from I/O dependencies."
        )
        fix = (
            f"Apply the Dependency Inversion Principle (DIP): Define an abstract repository interface or port inside the "
            f"Domain/Application layer. Implement the concrete database/API adapter in '{target_mod}'. Inject the interface "
            f"into '{source_mod}' at runtime."
        )
    elif "domain" in s_clean and "presentation" in t_clean:
        hazard = (
            "Circular/Inverted Layer Inversion: The core business logic is referencing UI/presentation formatters or controllers. "
            "This severely violates the clean architecture dependency rule (dependencies must always point inward)."
        )
        fix = (
            f"Remove the reference to '{target_mod}' from '{source_mod}'. Domain entities should only compute data and enforce business invariants. "
            f"Let the presentation controller handle UI formatting after obtaining data from the domain."
        )
    elif "infrastructure" in s_clean and "presentation" in t_clean:
        hazard = (
            "Inverted Delivery Coupling: Infrastructure adapters are referencing presentation web middleware or HTTP context. "
            "Database/network adapters should have no awareness of HTTP protocols, sessions, or web frameworks."
        )
        fix = (
            f"Pass necessary user or authentication context as pure method parameters from the Application layer into '{source_mod}', "
            f"rather than importing '{target_mod}' directly."
        )
    else:
        hazard = (
            f"Boundary Violation: No architectural rule permits '{source_layer}' to import '{target_layer}'. "
            f"This leads to spaghetti dependencies and increases maintenance cost."
        )
        fix = (
            f"Refactor the dependency path between '{source_mod}' and '{target_mod}'. Route communication through an approved "
            f"intermediary layer (such as the Application orchestration layer) or use Dependency Injection."
        )

    return hazard, fix

class ConformanceReport(BaseModel):
    violations: List[ArchitecturalViolation]
    score: float
    total_edges_checked: int

def check_architecture(
    G: nx.DiGraph, 
    mapping: Dict[str, str], 
    ruleset: Dict[str, Any]
) -> ConformanceReport:
    """
    Evaluates the physical dependencies (G) against the AI's semantic mapping
    and the strict JSON ruleset.
    """
    violations = []
    edges_checked = 0
    
    # Parse the rules from the JSON
    # Format: {(source_layer, target_layer): rule_dict}
    allowed_edges = {}
    for rule in ruleset.get("rules", []):
        if rule.get("type") == "allow":
            key = (rule["source_layer"], rule["target_layer"])
            allowed_edges[key] = rule

    # Loop through every actual import in the codebase
    for source_node, target_node, data in G.edges(data=True):
        # We only care about checking internal project files against each other
        source_type = G.nodes[source_node].get("node_type") or G.nodes[source_node].get("type")
        target_type = G.nodes[target_node].get("node_type") or G.nodes[target_node].get("type")
        if source_type != "internal" or target_type != "internal":
            continue
            
        edges_checked += 1
        
        # Get the layer the AI assigned to these files (default to unclassified)
        source_layer = mapping.get(source_node, "unclassified")
        target_layer = mapping.get(target_node, "unclassified")
        
        # If they are in the same layer, it's generally allowed (cohesion)
        if source_layer == target_layer:
            continue
            
        # Check if this edge is explicitly allowed in the JSON
        if (source_layer, target_layer) not in allowed_edges:
            # VIOLATION FOUND!
            line_no = data.get("line_number")
            code_line = data.get("code_snippet")
            hazard, remediation = get_xai_details(source_layer, target_layer, source_node, target_node)
            
            violations.append(
                ArchitecturalViolation(
                    source_module=source_node,
                    target_module=target_node,
                    source_layer=source_layer,
                    target_layer=target_layer,
                    severity="major", # Default severity for undocumented violations
                    reason=f"No rule allows {source_layer} to import {target_layer}.",
                    line_number=line_no,
                    code_snippet=code_line,
                    explanation=hazard,
                    remediation=remediation
                )
            )

    # Calculate a simple health score (starts at 100, drops per violation)
    score = 100.0
    if edges_checked > 0:
        penalty = (len(violations) / edges_checked) * 100
        score = max(0.0, 100.0 - penalty)

    return ConformanceReport(
        violations=violations,
        score=score,
        total_edges_checked=edges_checked
    )
