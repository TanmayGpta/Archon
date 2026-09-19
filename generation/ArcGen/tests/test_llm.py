"""Unit tests for ArcGen LLM clients and factory."""

import os
import unittest
from unittest.mock import MagicMock, patch
from pydantic import BaseModel
from generation.ArcGen.llm import GroqClient, OllamaClient, get_llm_client, BaseLLMClient


class SampleSchema(BaseModel):
    name: str
    count: int


class TestLLMClients(unittest.TestCase):

    def test_groq_client_requires_key_when_empty(self):
        clean_env = {k: v for k, v in os.environ.items() if "groq" not in k.lower()}
        with patch.dict(os.environ, clean_env, clear=True):
            with self.assertRaises(ValueError):
                GroqClient(api_key=None)

    def test_groq_client_generate_json_parsing(self):
        client = GroqClient(api_key="mock_key", model="test-model")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '```json\n{"name": "test_service", "count": 42}\n```'}}]
        }

        with patch("requests.post", return_value=mock_response):
            res = client.generate_json(
                system_prompt="Test system",
                user_prompt="Test user",
                target_schema=SampleSchema,
            )
            self.assertIsInstance(res, SampleSchema)
            self.assertEqual(res.name, "test_service")
            self.assertEqual(res.count, 42)

    def test_get_llm_client_explicit_providers(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "dummy_key"}):
            groq = get_llm_client(provider="groq")
            self.assertIsInstance(groq, GroqClient)

        with patch("generation.ArcGen.llm.OllamaClient.__init__", return_value=None):
            ollama = get_llm_client(provider="ollama")
            self.assertIsInstance(ollama, OllamaClient)

    def test_get_llm_client_auto_detection(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "dummy_key"}):
            client = get_llm_client()
            from generation.ArcGen.llm import ResilientLLMClient
            self.assertTrue(isinstance(client, (GroqClient, ResilientLLMClient)))

        clean_env = {k: v for k, v in os.environ.items() if "groq" not in k.lower() and "omnikey" not in k.lower()}
        with patch.dict(os.environ, clean_env, clear=True):
            with patch("generation.ArcGen.llm.OllamaClient.__init__", return_value=None):
                client = get_llm_client()
                self.assertIsInstance(client, OllamaClient)

    def test_safe_parse_json_empty_guards(self):
        from generation.ArcGen.llm import safe_parse_json
        for empty_val in ["", "   ", "\n\t ", "```json\n```", "```\n```"]:
            with self.assertRaises(ValueError):
                safe_parse_json(empty_val)

    def test_safe_parse_json_repair(self):
        from generation.ArcGen.llm import safe_parse_json
        # Missing comma between list items
        malformed = '{"items": ["item1" "item2"], "val": 10}'
        parsed = safe_parse_json(malformed)
        self.assertEqual(parsed["items"], ["item1", "item2"])
        self.assertEqual(parsed["val"], 10)

        # Unescaped quote inside string
        malformed_quote = '{"description": "Enables "Flash" media playback", "id": 1}'
        parsed_quote = safe_parse_json(malformed_quote)
        self.assertIn("Flash", parsed_quote["description"])
        self.assertEqual(parsed_quote["id"], 1)

    def test_safe_parse_json_conversational_preamble(self):
        from generation.ArcGen.llm import safe_parse_json
        conversational = """Here is your architectural assessment:
We found several drivers in the document.
```json
{"extracted": [{"dimension": "Latency Budget", "value": "24h"}]}
```
Hope this helps!"""
        parsed = safe_parse_json(conversational)
        self.assertIn("extracted", parsed)
        self.assertEqual(parsed["extracted"][0]["dimension"], "Latency Budget")

    def test_omnikey_client_generate_json(self):
        from generation.ArcGen.llm import OmniKeyClient
        client = OmniKeyClient(api_key="mock_omnikey_key", model="gemini-2.5-flash")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [{
                "finishReason": "STOP",
                "content": {"parts": [{"text": '```json\n{"name": "service_a", "count": 10}\n```'}]}
            }]
        }
        with patch("requests.post", return_value=mock_response):
            res = client.generate_json(
                system_prompt="system",
                user_prompt="user",
                target_schema=SampleSchema,
            )
            self.assertIsInstance(res, SampleSchema)
            self.assertEqual(res.name, "service_a")
            self.assertEqual(res.count, 10)

    def test_omnikey_payload_uncapped_by_default(self):
        from generation.ArcGen.llm import OmniKeyClient, FALLBACK_OMNIKEY_MODELS
        self.assertEqual(FALLBACK_OMNIKEY_MODELS, ["gemini-2.5-flash"])

        client = OmniKeyClient(api_key="mock_omnikey_key", model="gemini-2.5-flash")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [{
                "finishReason": "STOP",
                "content": {"parts": [{"text": '{"name": "service_b", "count": 20}'}]}
            }]
        }
        with patch("requests.post", return_value=mock_response) as mock_post:
            client.generate_json(
                system_prompt="sys",
                user_prompt="usr",
                target_schema=SampleSchema,
            )
            sent_payload = mock_post.call_args[1]["json"]
            self.assertNotIn("maxOutputTokens", sent_payload["generationConfig"])

    def test_groq_payload_uncapped_by_default(self):
        client = GroqClient(api_key="mock_key", model="test-model")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": '{"name": "service_c", "count": 30}'}}]
        }
        with patch("requests.post", return_value=mock_response) as mock_post:
            client.generate_json(
                system_prompt="sys",
                user_prompt="usr",
                target_schema=SampleSchema,
            )
            sent_payload = mock_post.call_args[1]["json"]
            self.assertNotIn("max_tokens", sent_payload)

    def test_resilient_client_failover_cascade(self):
        from generation.ArcGen.llm import ResilientLLMClient

        tier1 = MagicMock(spec=BaseLLMClient)
        tier1.generate_json.side_effect = RuntimeError("OmniKey Gemini down")

        tier2 = MagicMock(spec=BaseLLMClient)
        tier2.generate_json.side_effect = RuntimeError("Groq rate limited")

        tier3 = MagicMock(spec=BaseLLMClient)
        tier3.generate_json.return_value = SampleSchema(name="from_ollama", count=99)

        client = ResilientLLMClient([tier1, tier2, tier3])
        res = client.generate_json(
            system_prompt="sys",
            user_prompt="usr",
            target_schema=SampleSchema,
        )
        self.assertEqual(res.name, "from_ollama")
        self.assertEqual(res.count, 99)
        tier1.generate_json.assert_called_once()
        tier2.generate_json.assert_called_once()
        tier3.generate_json.assert_called_once()


if __name__ == "__main__":
    unittest.main()

