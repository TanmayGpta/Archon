"""GitHub repos as audit targets: shallow-clone into test_codebases/imported/<owner>__<repo>.

Ported from the agai-dev gateway (archon_agai/gateway.py, /api/agai/github/import) so both features
share one clone folder. The audit needs real files on disk for AST extraction.
"""

import re
import subprocess
from pathlib import Path
from typing import Optional

_SLUG = re.compile(r"[\w.-]+/[\w.-]+")


def github_slug(target: Optional[str]) -> Optional[str]:
    """'owner/repo' for a github.com URL (or 'gh:owner/repo'), else None.

    A bare 'owner/repo' is not treated as GitHub because it is also a valid relative folder path.
    """
    if not target:
        return None
    text = target.strip().strip('"').strip("'")
    if text.startswith("gh:"):
        slug = text[3:]
    elif "github.com/" in text:
        slug = text.split("github.com/", 1)[1]
    else:
        return None
    parts = slug.strip("/").split("/")
    if len(parts) < 2:
        return None
    slug = f"{parts[0]}/{parts[1].removesuffix('.git')}"
    return slug if _SLUG.fullmatch(slug) else None


def import_github_repo(slug: str, root: Path, branch: Optional[str] = None) -> Path:
    """Clones (or fast-forwards) the repo and returns its local folder. Raises ValueError with a readable reason."""
    import_dir = root / "test_codebases" / "imported"
    dest = import_dir / slug.replace("/", "__")
    if (dest / ".git").exists():
        cmd = ["git", "-C", str(dest), "pull", "--ff-only"]
    else:
        import_dir.mkdir(parents=True, exist_ok=True)
        cmd = ["git", "clone", "--depth", "1", *(["--branch", branch] if branch else []),
               f"https://github.com/{slug}.git", str(dest)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except FileNotFoundError:
        raise ValueError("git is not installed where the conformance service runs.")
    except subprocess.TimeoutExpired:
        raise ValueError(f"Cloning {slug} took longer than 5 minutes.")
    # A failed pull on an existing clone still leaves usable files; a failed clone does not
    if r.returncode != 0 and not (dest / ".git").exists():
        raise ValueError(f"Could not clone {slug}: {r.stderr.strip()[-400:] or 'git failed'}")
    return dest
