import networkx as nx
from typing import Dict, Set, List, Tuple
from conformance.extraction import extract_project_dependencies

# Standard library modules to visually de-emphasize (still shown but styled differently)
STDLIB_MODULES = {
    "os", "sys", "re", "json", "math", "time", "datetime", "collections",
    "itertools", "functools", "pathlib", "typing", "abc", "io", "copy",
    "hashlib", "uuid", "random", "string", "struct", "socket", "threading",
    "multiprocessing", "subprocess", "shutil", "tempfile", "glob", "fnmatch",
    "logging", "warnings", "traceback", "inspect", "ast", "dis", "types",
    "enum", "dataclasses", "contextlib", "weakref", "gc", "platform",
    "unittest", "http", "urllib", "email", "html", "xml", "csv", "sqlite3",
    "base64", "binascii", "codecs", "locale", "gettext", "argparse", "textwrap",
}

def build_dependency_graph(dependencies: Dict[str, Set[str]]) -> nx.DiGraph:
    """
    Converts a dictionary of dependencies into a rich NetworkX Directed Graph.
    Shows ALL imports (internal, stdlib, and external) as different node types.
    """
    G = nx.DiGraph()
    
    internal_modules = set(dependencies.keys())

    for source_module, imports in dependencies.items():
        # Always add the source node as "internal"
        if not G.has_node(source_module):
            G.add_node(source_module, node_type="internal")
            
        for target_module in imports:
            # Strip sub-modules to get root package: "os.path" -> "os"
            root_import = target_module.split(".")[0]
            
            if target_module in internal_modules or root_import in internal_modules:
                # It's an internal project file - draw the edge
                target_key = target_module if target_module in internal_modules else root_import
                G.add_node(target_key, node_type="internal")
                G.add_edge(source_module, target_key)
            elif root_import in STDLIB_MODULES:
                # It's a Python standard library module
                if not G.has_node(root_import):
                    G.add_node(root_import, node_type="stdlib")
                G.add_edge(source_module, root_import)
            else:
                # It's a third-party library (flask, numpy, langchain, etc.)
                if not G.has_node(root_import):
                    G.add_node(root_import, node_type="external")
                G.add_edge(source_module, root_import)
                
    return G

def find_cycles(G: nx.DiGraph) -> List[List[str]]:
    """
    Uses Tarjan's algorithm (via NetworkX) to find all circular dependencies.
    Only checks internal project nodes, not external libraries.
    """
    # Build a subgraph with only internal nodes for cycle detection
    internal_nodes = [n for n, d in G.nodes(data=True) if d.get("node_type") == "internal"]
    internal_subgraph = G.subgraph(internal_nodes)
    
    try:
        return list(nx.simple_cycles(internal_subgraph))
    except nx.NetworkXNoCycle:
        return []

if __name__ == "__main__":
    import os
    import sys
    
    if len(sys.argv) > 1:
        project_dir = os.path.abspath(sys.argv[1])
    else:
        project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        
    print(f"Extracting dependencies from: {project_dir}")
    raw_deps = extract_project_dependencies(project_dir)
    
    print("Building Directed Graph...")
    G = build_dependency_graph(raw_deps)
    
    internal = [n for n, d in G.nodes(data=True) if d.get("node_type") == "internal"]
    stdlib   = [n for n, d in G.nodes(data=True) if d.get("node_type") == "stdlib"]
    external = [n for n, d in G.nodes(data=True) if d.get("node_type") == "external"]
    
    print(f"\n--- Graph Statistics ---")
    print(f"Internal Modules : {len(internal)}")
    print(f"Stdlib Modules   : {len(stdlib)}")
    print(f"External Packages: {len(external)}")
    print(f"Total Edges      : {G.number_of_edges()}")
    
    print("\n--- Cycle Detection (internal only) ---")
    cycles = find_cycles(G)
    if not cycles:
        print("[OK] No circular dependencies found!")
    else:
        print(f"[ERROR] Found {len(cycles)} circular dependencies:")
        for cycle in cycles:
            path = " -> ".join(cycle) + f" -> {cycle[0]}"
            print(f"  {path}")
