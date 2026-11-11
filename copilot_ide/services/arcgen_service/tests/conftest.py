import pytest


@pytest.fixture(autouse=True)
def _isolated_llm_settings(tmp_path, monkeypatch):
    """Never read or write the developer's saved UI settings (output/llm_settings.json)."""
    monkeypatch.setenv("ARCGEN_SETTINGS_PATH", str(tmp_path / "llm_settings.json"))
