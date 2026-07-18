import os
from pathlib import Path

# I've silently added __init__.py files to the directories in this dictionary. 
# Without them, Python will struggle to import your modules across folders.
structure = {
    "shared": ["__init__.py", "schema.py"],
    "shared/fixtures": [], # Just the folder, you can drop JSONs here later
    "shared/cli": ["__init__.py", "main.py"],
    "generation": ["__init__.py", "graph.py"],
    "generation/agents": ["__init__.py", "modeler.py", "evaluator.py"],
    "generation/tests": ["__init__.py"],
    "conformance": ["__init__.py", "extraction.py", "classifier_agent.py", "checker.py", "graph.py"],
    "conformance/tests": ["__init__.py"],
    "docs": ["architecture_decisions.md", "evaluation.md"],
    ".": ["README.md", "requirements.txt"]
}

# Generate the structure
for folder, files in structure.items():
    Path(folder).mkdir(parents=True, exist_ok=True)
    for file in files:
        Path(folder).joinpath(file).touch(exist_ok=True)

print("New Archon structure initialized successfully.")