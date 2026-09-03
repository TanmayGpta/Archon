from typing import Dict, List, Any
import networkx as nx
from pydantic import BaseModel

class ArchitecturalViolation(BaseModel):
    source_module: str
    target_module: str
    source_layer: str
    target_layer: str
    severity: str
    reason: str

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
        if G.nodes[source_node].get("type") != "internal" or G.nodes[target_node].get("type") != "internal":
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
            violations.append(
                ArchitecturalViolation(
                    source_module=source_node,
                    target_module=target_node,
                    source_layer=source_layer,
                    target_layer=target_layer,
                    severity="major", # Default severity for undocumented violations
                    reason=f"No rule allows {source_layer} to import {target_layer}."
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
