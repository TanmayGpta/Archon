import networkx as nx
from typing import Dict, Set, List
from conformance.extraction import extract_project_dependencies

def build_dependency_graph(dependencies: Dict[str, Set[str]]) -> nx.DiGraph:
    """
    Converts a dictionary of dependencies into a NetworkX Directed Graph.
    """
    G = nx.DiGraph()
    
    # Add all nodes and edges
    for source_module, imports in dependencies.items():
        # Ensure the source node exists (even if it imports nothing)
        if not G.has_node(source_module):
            G.add_node(source_module)
            
        for target_module in imports:
            # We only care about internal project dependencies for architecture rules.
            # So, if 'target_module' isn't in our dictionary keys, it's probably 
            # an external library (like 'os', 'pydantic', or 'flask').
            # We filter those out to keep the graph clean.
            if target_module in dependencies:
                G.add_edge(source_module, target_module)
                
    return G

def find_cycles(G: nx.DiGraph) -> List[List[str]]:
    """
    Uses Tarjan's algorithm (via NetworkX) to find all circular dependencies.
    """
    try:
        # simple_cycles finds all elementary circuits
        return list(nx.simple_cycles(G))
    except nx.NetworkXNoCycle:
        return []

if __name__ == "__main__":
    import os
    import sys
    
    # 1. Extract raw dependencies
    if len(sys.argv) > 1:
        project_dir = os.path.abspath(sys.argv[1])
    else:
        project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        
    print(f"Extracting dependencies from: {project_dir}")
    raw_deps = extract_project_dependencies(project_dir)
    
    # 2. Build the NetworkX Graph
    print("Building Directed Graph...")
    G = build_dependency_graph(raw_deps)
    
    print("\n--- Graph Statistics ---")
    print(f"Total Nodes (Files): {G.number_of_nodes()}")
    print(f"Total Edges (Imports): {G.number_of_edges()}")
    
    # 3. Check for cycles
    print("\n--- Cycle Detection ---")
    cycles = find_cycles(G)
    
    if not cycles:
        print("[OK] No circular dependencies found!")
    else:
        print(f"[ERROR] Found {len(cycles)} circular dependencies:")
        for cycle in cycles:
            # Print cycle path: A -> B -> C -> A
            path = " -> ".join(cycle) + f" -> {cycle[0]}"
            print(f"  {path}")
