"""Generator LLM choice and API keys set from the ArcGen UI.

Stored as JSON in the gitignored output/ folder (ARCGEN_SETTINGS_PATH overrides the location).
Anything not set here falls back to the environment, so a .env-only setup keeps working:
  - provider "auto" keeps the OmniKey -> Groq -> Ollama fallback chain;
  - a key saved here wins over the .env key for that provider;
  - a model saved here wins over OMNIKEY_MODEL / GROQ_MODEL / OLLAMA_MODEL.
Key values are only read by get_llm_client(); the API reports them masked.
"""

import json
import os
import threading
from pathlib import Path
from typing import Dict, Literal, Optional, Tuple

from pydantic import BaseModel, Field

Provider = Literal["omnikey", "groq", "ollama"]
PROVIDERS: Tuple[str, ...] = ("omnikey", "groq", "ollama")
KEY_PROVIDERS: Tuple[str, ...] = ("omnikey", "groq")
ENV_KEY_NAMES: Dict[str, Tuple[str, ...]] = {
    "omnikey": ("OMNIKEY_API_KEY", "omnikey"),
    "groq": ("GROQ_API_KEY", "groq"),
}

_lock = threading.Lock()


class LLMSettings(BaseModel):
    provider: Literal["auto", "omnikey", "groq", "ollama"] = "auto"
    models: Dict[str, str] = Field(default_factory=dict, description="provider -> model chosen in the UI")
    keys: Dict[str, str] = Field(default_factory=dict, description="provider -> API key entered in the UI")


def settings_path() -> Path:
    default = Path(__file__).resolve().parents[1] / "output" / "llm_settings.json"
    return Path(os.getenv("ARCGEN_SETTINGS_PATH") or default)


def load() -> LLMSettings:
    path = settings_path()
    try:
        return LLMSettings.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except FileNotFoundError:
        return LLMSettings()
    except Exception:  # noqa: BLE001 - a corrupt file must not take the generator down
        return LLMSettings()


def save(settings: LLMSettings) -> None:
    path = settings_path()
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
        os.replace(tmp, path)


def api_key(provider: str, settings: Optional[LLMSettings] = None) -> Tuple[Optional[str], Optional[str]]:
    """(key, source) where source is "ui", "env" or None."""
    s = settings or load()
    if s.keys.get(provider):
        return s.keys[provider], "ui"
    for name in ENV_KEY_NAMES.get(provider, ()):
        if os.getenv(name):
            return os.getenv(name), "env"
    return None, None


def mask(key: Optional[str]) -> str:
    if not key:
        return ""
    return f"{key[:4]}…{key[-4:]}" if len(key) > 12 else "…"
