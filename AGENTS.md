# Archon

## Code lookup: graphify first
A knowledge graph of this repo lives in `graphify-out/graph.json` (gitignored, local).
For any "where is / what calls / how does X flow / which files touch Y" question, query the graph BEFORE Grep/Glob/Read:

```powershell
& "$env:APPDATA\Python\Python313\Scripts\graphify.exe" query "<question>" --budget 800
& "$env:APPDATA\Python\Python313\Scripts\graphify.exe" path "<A>" "<B>"
& "$env:APPDATA\Python\Python313\Scripts\graphify.exe" explain "<symbol>"
```

- Use the returned `file:Lline` pointers to Read only those line ranges, not whole files.
- Never Read `graphify-out/graph.json` or `graph.html` directly (~2MB each).
- Fall back to Grep only if the graph has no hit or the code is newer than the graph.
- After significant changes, refresh: `graphify.exe . --update` (offline with `$env:GRAPHIFY_BACKEND="none"`).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
