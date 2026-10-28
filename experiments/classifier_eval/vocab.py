"""Path vocabulary: how a mined file gets its layer label, and how that label is hidden from the model.

Labels come from layer-named directories (the same signal the studio heuristic trusts).
Every vocabulary segment is then masked to "pkg" in paths and import lines, so a candidate
has to infer the layer from the code itself, which is the case the LLM classifier exists for.
"""
import re

LAYERS = ["Domain", "Application", "Presentation", "Infrastructure"]

# A primary segment names the layer outright and wins over anything nested inside it.
PRIMARY = {
    "domain": "Domain",
    "application": "Application",
    "infrastructure": "Infrastructure",
    "infra": "Infrastructure",
    "presentation": "Presentation",
}

# Used only when the path has no primary segment.
SECONDARY = {
    "entities": "Domain", "entity": "Domain", "domain_model": "Domain",
    "use_cases": "Application", "usecases": "Application", "use_case": "Application", "usecase": "Application",
    "persistence": "Infrastructure", "repositories": "Infrastructure", "repository": "Infrastructure",
    "entrypoints": "Presentation", "entry_points": "Presentation", "controllers": "Presentation",
    "routers": "Presentation", "routes": "Presentation", "views": "Presentation", "api": "Presentation",
    "web": "Presentation", "cli": "Presentation", "delivery": "Presentation", "presenters": "Presentation",
}

VOCAB = set(PRIMARY) | set(SECONDARY)

SKIP_DIRS = {"tests", "test", "testing", "migrations", "alembic", "docs", "doc", "scripts",
             "venv", ".venv", "env", "site-packages", "node_modules", "build", "dist", "__pycache__"}


def label_for(dir_parts):
    """Layer label from a file's directory segments, or None when absent or ambiguous."""
    parts = [p.lower() for p in dir_parts]
    primary = {PRIMARY[p] for p in parts if p in PRIMARY}
    if len(primary) == 1:
        return primary.pop()
    if primary:
        return None
    secondary = {SECONDARY[p] for p in parts if p in SECONDARY}
    return secondary.pop() if len(secondary) == 1 else None


def mask_dotted(name):
    """a.domain.models -> a.pkg.models (relative-import dots are kept)."""
    lead = len(name) - len(name.lstrip("."))
    segs = name[lead:].split(".") if name[lead:] else []
    return name[:lead] + ".".join("pkg" if s.lower() in VOCAB else s for s in segs)


_IMPORT_LINE = re.compile(r"^(\s*(?:from|import)\s+)(.*)$")
_DOTTED = re.compile(r"\.*[A-Za-z_][\w.]*")


def mask_source(text):
    """Masks vocabulary segments on import lines only; other code is left as written."""
    out = []
    for line in text.splitlines():
        m = _IMPORT_LINE.match(line)
        if m:
            line = m.group(1) + _DOTTED.sub(lambda d: mask_dotted(d.group(0)), m.group(2))
        out.append(line)
    return "\n".join(out)
