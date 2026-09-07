import ast
import os
from typing import Set, Dict, Any

def extract_imports_from_file(filepath: str) -> Dict[str, Dict[str, Any]]:
    """
    Reads a Python file and returns a dictionary mapping imported modules
    to their metadata (line number and actual code snippet).
    """
    imports = {}
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            file_content = file.read()
    except Exception:
        return imports

    lines = file_content.splitlines()

    try:
        tree = ast.parse(file_content, filename=filepath)
    except SyntaxError:
        return imports

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            lineno = getattr(node, "lineno", 1)
            code_line = lines[lineno - 1].strip() if 0 < lineno <= len(lines) else ""
            for alias in node.names:
                imports[alias.name] = {
                    "line_number": lineno,
                    "code_snippet": code_line
                }
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                lineno = getattr(node, "lineno", 1)
                code_line = lines[lineno - 1].strip() if 0 < lineno <= len(lines) else ""
                prefix = "." * node.level if node.level > 0 else ""
                target_mod = f"{prefix}{node.module}"
                imports[target_mod] = {
                    "line_number": lineno,
                    "code_snippet": code_line
                }
                
    return imports

def extract_project_dependencies(project_root: str) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """
    Recursively scans a project directory for Python files and maps their dependencies
    along with line numbers and code snippets.
    Returns: { source_module: { target_module: {'line_number': int, 'code_snippet': str} } }
    """
    dependencies = {}
    
    for root, _, files in os.walk(project_root):
        # Skip common hidden/cache directories
        if any(skip in root for skip in [".venv", "__pycache__", ".git"]):
            continue
            
        for file in files:
            if file.endswith(".py"):
                filepath = os.path.join(root, file)
                
                # Convert file path into Python module name 
                rel_path = os.path.relpath(filepath, project_root)
                if file == "__init__.py":
                    module_name = os.path.dirname(rel_path).replace(os.sep, ".")
                    if not module_name: # Root __init__.py
                        continue
                else:
                    module_name = rel_path.replace(os.sep, ".")[:-3]
                
                imports_with_meta = extract_imports_from_file(filepath)
                dependencies[module_name] = imports_with_meta
                
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
