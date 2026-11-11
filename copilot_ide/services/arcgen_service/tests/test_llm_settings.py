"""UI-saved generator settings: precedence over .env, key masking and the settings API."""

import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import llm_settings
from app.llm import GroqClient, OllamaClient, OmniKeyClient, ResilientLLMClient, get_llm_client
from app.main import app

@pytest.fixture
def clean_env():
    # Built at test time so ARCGEN_SETTINGS_PATH from conftest survives the clear.
    no_keys = {k: v for k, v in os.environ.items()
               if not any(x in k.lower() for x in ("groq", "omnikey", "llm_provider"))}
    with patch.dict(os.environ, no_keys, clear=True):
        yield


def test_ui_key_enables_groq_tier_without_env(clean_env):
    llm_settings.save(llm_settings.LLMSettings(keys={"groq": "gsk_ui_key_123456"}))
    client = get_llm_client()
    assert isinstance(client, ResilientLLMClient)
    groq = client.clients[0]
    assert isinstance(groq, GroqClient) and groq.api_key == "gsk_ui_key_123456"
    assert isinstance(client.clients[-1], OllamaClient)


def test_ui_key_and_model_beat_env(clean_env):
    with patch.dict(os.environ, {"GROQ_API_KEY": "env_key"}):
        llm_settings.save(llm_settings.LLMSettings(provider="groq", keys={"groq": "ui_key"},
                                                   models={"groq": "llama-3.3-70b-versatile"}))
        client = get_llm_client()
    assert isinstance(client, GroqClient)
    assert (client.api_key, client.model) == ("ui_key", "llama-3.3-70b-versatile")


def test_explicit_argument_beats_ui_choice(clean_env):
    llm_settings.save(llm_settings.LLMSettings(provider="groq", keys={"groq": "k"}))
    assert isinstance(get_llm_client(provider="ollama"), OllamaClient)


def test_env_key_still_used_when_ui_empty(clean_env):
    with patch.dict(os.environ, {"OMNIKEY_API_KEY": "env_omni"}):
        client = get_llm_client()
    assert isinstance(client.clients[0], OmniKeyClient) and client.clients[0].api_key == "env_omni"


def test_mask_never_reveals_key():
    assert llm_settings.mask("gsk_abcdefghijklmnop") == "gsk_…mnop"
    assert llm_settings.mask("short") == "…"
    assert llm_settings.mask(None) == ""


def test_corrupt_settings_file_falls_back_to_defaults():
    llm_settings.settings_path().write_text("{not json", encoding="utf-8")
    assert llm_settings.load() == llm_settings.LLMSettings()


def test_api_round_trip_never_returns_raw_key(clean_env):
    api = TestClient(app)
    r = api.put("/api/arcgen/llm", json={"provider": "groq"})
    assert r.status_code == 400  # no key yet

    r = api.put("/api/arcgen/llm/keys/groq", json={"api_key": "gsk_secret_value_9999"})
    assert r.status_code == 200 and "gsk_secret_value_9999" not in r.text
    assert r.json()["providers"]["groq"]["key_source"] == "ui"

    r = api.put("/api/arcgen/llm", json={"provider": "groq", "models": {"groq": "qwen/qwen3-32b"}})
    body = r.json()
    assert body["provider"] == "groq"
    assert body["chain"] == [{"provider": "groq", "model": "qwen/qwen3-32b"}]

    # Clearing the only key of the chosen provider drops back to the fallback chain.
    body = api.delete("/api/arcgen/llm/keys/groq").json()
    assert body["provider"] == "auto" and body["providers"]["groq"]["configured"] is False


def test_ollama_takes_no_key():
    r = TestClient(app).put("/api/arcgen/llm/keys/ollama", json={"api_key": "x"})
    assert r.status_code == 400
