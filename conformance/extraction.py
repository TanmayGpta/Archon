import ast
import os
from typing import Set, Dict

def extract_imports_from_file(filepath: str) -> Set[str]:
    """Reads a Python file and returns a set of all modules it imports."""
    imports = set()
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            file_content = file.read()
    except Exception:
        return imports

    try:
        tree = ast.parse(file_content, filename=filepath)
    except SyntaxError:
        return imports

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                prefix = "." * node.level if node.level > 0 else ""
                imports.add(f"{prefix}{node.module}")
                
    return imports

def extract_project_dependencies(project_root: str) -> Dict[str, Set[str]]:
    """
    Recursively scans a project directory for Python files and maps their dependencies.
    Returns a dictionary mapping module names to a set of imported modules.
    """
    dependencies = {}
    
    for root, _, files in os.walk(project_root):
        # Optional: skip common hidden/cache directories
        if any(skip in root for skip in [".venv", "__pycache__", ".git"]):
            continue
            
        for file in files:
            if file.endswith(".py"):
                filepath = os.path.join(root, file)
                
                # Convert the file path into a Python module name 
                # (e.g., "conformance/extraction.py" -> "conformance.extraction")
                rel_path = os.path.relpath(filepath, project_root)
                if file == "__init__.py":
                    module_name = os.path.dirname(rel_path).replace(os.sep, ".")
                    if not module_name: # Root __init__.py
                        continue
                else:
                    module_name = rel_path.replace(os.sep, ".")[:-3]
                
                imports = extract_imports_from_file(filepath)
                dependencies[module_name] = imports
                
    return dependencies

if __name__ == "__main__":
    # Test on the root archon directory
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print(f"Scanning project directory: {project_dir}\n")
    
    deps = extract_project_dependencies(project_dir)
    
    # Print the dependency map in a readable way
    for module, imports in deps.items():
        print(f"[{module}] imports:")
        if not imports:
            print("  (Nothing)")
        for imp in sorted(imports):
            print(f"  -> {imp}")
        print()
