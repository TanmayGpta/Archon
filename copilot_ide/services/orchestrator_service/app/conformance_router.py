"""FastAPI Router bridging Conformance Studio to Orchestrator Gateway."""

import sys
import traceback
from pathlib import Path

# Safely discover and add workspace / Archon root to sys.path
for candidate in [
    Path("/workspace"),
    Path(__file__).resolve().parent.parent,
    Path("C:/Users/krish/OneDrive/Desktop/Archon"),
]:
    if candidate.exists() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

# Safely search any parent directory that contains 'conformance'
for p in Path(__file__).resolve().parents:
    if (p / "conformance").exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))

load_error = None
try:
    from conformance.studio.api import router
except Exception:
    load_error = traceback.format_exc()
    from fastapi import APIRouter
    router = APIRouter()
    
    @router.get("/status")
    def status():
        return {"status": "error", "traceback": load_error}
