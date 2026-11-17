"""Generator LLM settings API (mounted at /api/arcgen/llm by app.main).

GET    /                  current choice, per-provider key status (masked) and model, the active chain
PUT    /                  {provider, models}: choose a provider ("auto" = fallback chain) and models
PUT    /keys/{provider}   {api_key}: save a key (wins over .env)
DELETE /keys/{provider}   forget the saved key (the .env key, if any, applies again)
GET    /models/{provider} model names the provider offers (live where possible)
POST   /test              {provider, model?, api_key?}: check the key / host and that the model exists
"""

import os
from pathlib import Path
import time
from typing import Dict, List, Literal, Optional

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import llm_settings
from app.llm import (
    DEFAULT_OLLAMA_HOST,
    DEFAULT_OMNIKEY_BASE,
    FALLBACK_GROQ_MODELS,
    FALLBACK_OMNIKEY_MODELS,
    ResilientLLMClient,
    default_model,
    get_llm_client,
    get_ollama_host,
    provider_of,
)

router = APIRouter()

LABELS = {
    "omnikey": "OmniKey (Gemini gateway)",
    "groq": "Groq Cloud",
    "ollama": "Ollama (local)",
}
TIMEOUT = 8


class SettingsUpdate(BaseModel):
    provider: Literal["auto", "omnikey", "groq", "ollama"]
    models: Optional[Dict[str, str]] = None  # "" resets that provider to its default model


class KeyUpdate(BaseModel):
    api_key: str


class TestRequest(BaseModel):
    provider: Literal["omnikey", "groq", "ollama"]
    model: Optional[str] = None
    api_key: Optional[str] = None


class TunnelUpdate(BaseModel):
    url: str


@router.post("/tunnel")
def register_tunnel(req: TunnelUpdate):
    """Registers an active Ollama tunnel URL dynamically."""
    clean = req.url.strip().rstrip("/")
    try:
        Path("/tmp/ollama_host.txt").write_text(clean)
    except Exception as e:
        pass
    return {"status": "connected", "host": clean}


def _check_provider(provider: str) -> None:
    if provider not in llm_settings.PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider '{provider}'")


def _status() -> dict:
    s = llm_settings.load()
    providers = {}
    for p in llm_settings.PROVIDERS:
        key, source = llm_settings.api_key(p, s) if p in llm_settings.KEY_PROVIDERS else (None, None)
        providers[p] = {
            "label": LABELS[p],
            "needs_key": p in llm_settings.KEY_PROVIDERS,
            "configured": bool(key) or p == "ollama",
            "key_source": source,
            "masked_key": llm_settings.mask(key),
            "model": s.models.get(p) or default_model(p),
            "default_model": default_model(p),
            "model_is_default": not s.models.get(p),
        }
    providers["ollama"]["host"] = get_ollama_host()
    try:
        client = get_llm_client()
        tiers = client.clients if isinstance(client, ResilientLLMClient) else [client]
        chain = [{"provider": provider_of(c), "model": getattr(c, "model", "")} for c in tiers]
        error = None
    except Exception as e:  # noqa: BLE001 - e.g. a provider chosen without a key
        chain, error = [], str(e)
    return {"provider": s.provider, "providers": providers, "chain": chain, "error": error}


@router.get("")
def get_settings():
    return _status()


@router.put("")
def update_settings(req: SettingsUpdate):
    s = llm_settings.load()
    if req.provider in llm_settings.KEY_PROVIDERS and not llm_settings.api_key(req.provider, s)[0]:
        raise HTTPException(status_code=400, detail=f"Add an API key for {LABELS[req.provider]} first.")
    s.provider = req.provider
    for p, m in (req.models or {}).items():
        _check_provider(p)
        if m and m.strip():
            s.models[p] = m.strip()
        else:
            s.models.pop(p, None)
    llm_settings.save(s)
    return _status()


@router.put("/keys/{provider}")
def set_key(provider: str, req: KeyUpdate):
    if provider not in llm_settings.KEY_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"{provider} does not take an API key")
    key = req.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Empty API key")
    s = llm_settings.load()
    s.keys[provider] = key
    llm_settings.save(s)
    return _status()


@router.delete("/keys/{provider}")
def clear_key(provider: str):
    _check_provider(provider)
    s = llm_settings.load()
    s.keys.pop(provider, None)
    # Picking a provider that no longer has any key would break generation: fall back to auto.
    if s.provider == provider and not llm_settings.api_key(provider, s)[0]:
        s.provider = "auto"
    llm_settings.save(s)
    return _status()


def _list_models(provider: str, api_key: Optional[str] = None) -> List[str]:
    """Live model list; raises on a bad key / unreachable host."""
    if provider == "ollama":
        r = requests.get(f"{get_ollama_host().rstrip('/')}/api/tags", timeout=TIMEOUT)
        r.raise_for_status()
        return sorted(m["name"] for m in r.json().get("models", []))
    key = api_key or llm_settings.api_key(provider)[0]
    if not key:
        raise ValueError("no API key")
    if provider == "groq":
        r = requests.get("https://api.groq.com/openai/v1/models",
                         headers={"Authorization": f"Bearer {key}"}, timeout=TIMEOUT)
        r.raise_for_status()
        skip = ("whisper", "tts", "guard", "prompt-guard")
        return sorted(m["id"] for m in r.json().get("data", []) if not any(x in m["id"] for x in skip))
    base = (os.getenv("OMNIKEY_BASE_URL") or DEFAULT_OMNIKEY_BASE).rstrip("/")
    r = requests.get(f"{base}/models", params={"key": key}, headers={"x-goog-api-key": key}, timeout=TIMEOUT)
    r.raise_for_status()
    names = []
    for m in r.json().get("models", []):
        methods = m.get("supportedGenerationMethods")
        if methods is None or "generateContent" in methods:
            names.append(str(m.get("name", "")).removeprefix("models/"))
    return sorted(n for n in names if n)


@router.get("/models/{provider}")
def list_models(provider: str):
    _check_provider(provider)
    fallback = {"omnikey": FALLBACK_OMNIKEY_MODELS, "groq": FALLBACK_GROQ_MODELS, "ollama": []}[provider]
    try:
        return {"provider": provider, "live": True, "models": _list_models(provider)}
    except Exception as e:  # noqa: BLE001 - suggestions only; the UI still accepts free text
        models = list(dict.fromkeys([default_model(provider), *fallback]))
        return {"provider": provider, "live": False, "models": models, "error": str(e)[:200]}


@router.post("/test")
def test_provider(req: TestRequest):
    model = (req.model or "").strip() or llm_settings.load().models.get(req.provider) or default_model(req.provider)
    started = time.monotonic()
    try:
        models = _list_models(req.provider, api_key=(req.api_key or "").strip() or None)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "401" in msg or "403" in msg:
            msg = "API key rejected"
        elif req.provider == "ollama":
            msg = f"Ollama not reachable at {get_ollama_host()}"
        return {"ok": False, "message": msg[:200], "latency_ms": int((time.monotonic() - started) * 1000)}
    latency = int((time.monotonic() - started) * 1000)
    if models and model not in models:
        hint = " (run `ollama pull " + model + "`)" if req.provider == "ollama" else ""
        return {"ok": False, "message": f"Connected, but model '{model}' is not available{hint}", "latency_ms": latency}
    return {"ok": True, "message": f"Connected · {model}", "latency_ms": latency}
