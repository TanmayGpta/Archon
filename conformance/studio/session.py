"""Session record persistence for Conformance Studio and IDE."""

import json
import time
from pathlib import Path
from typing import Dict, Any, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
SESSIONS_DIR = ROOT_DIR / "conformance_sessions" if ROOT_DIR.name in ("copilot_ide", "workspace") else ROOT_DIR / "copilot_ide" / "conformance_sessions"


def save_session(data: Dict[str, Any]) -> str:
    """Saves the audit session to disk so a service restart doesn't lose it."""
    try:
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        latest_file = SESSIONS_DIR / "latest.json"
        session_id = f"session_{int(time.time())}"
        record = {
            "sessionId": session_id,
            "savedAt": time.time(),
            **data
        }
        with open(latest_file, "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2)
        return session_id
    except Exception as e:
        print(f"Warning: Failed to save conformance session: {e}")
        return ""


def load_latest_session() -> Optional[Dict[str, Any]]:
    """Loads the most recent audit session from disk."""
    latest_file = SESSIONS_DIR / "latest.json"
    if not latest_file.exists():
        return None
    try:
        with open(latest_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None
