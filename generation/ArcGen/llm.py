"""LLM provider wrapper for ArcGen.

Supports:
1. OmniKey Unified Gateway (Fast Gemini-protocol proxy with diverse cloud model access)
2. Groq Cloud API (Extremely fast responses using e.g. 'openai/gpt-oss-120b' or 'qwen/qwen3.8-27b')
3. Local Ollama (Self-hosted e.g. 'qwen2.5-coder:32b' on cluster or local port 11434)
"""

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Type, TypeVar, Union
from pydantic import BaseModel
import requests

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# --- Automatic .env Loader ---
def _load_env_files():
    """Finds and loads .env files from ArcGen directory or repo root into os.environ."""
    candidates = [
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env",
    ]
    for env_path in candidates:
        if env_path.is_file():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip().strip("\"'")
                        if key not in os.environ:
                            os.environ[key] = val
                            # Also normalize 'groq' to GROQ_API_KEY
                            if key.lower() == "groq" and "GROQ_API_KEY" not in os.environ:
                                os.environ["GROQ_API_KEY"] = val
                            if key.lower() == "omnikey" and "OMNIKEY_API_KEY" not in os.environ:
                                os.environ["OMNIKEY_API_KEY"] = val
                            if key.lower() == "omnikey_base" and "OMNIKEY_BASE_URL" not in os.environ:
                                os.environ["OMNIKEY_BASE_URL"] = val
                            if key.lower() == "llm_ep" and "OLLAMA_HOST" not in os.environ:
                                os.environ["OLLAMA_HOST"] = val
            except Exception as e:
                logger.warning(f"Failed loading {env_path}: {e}")

_load_env_files()

# Defaults
DEFAULT_OMNIKEY_MODEL = os.getenv("OMNIKEY_MODEL", "gemini-2.5-flash")
FALLBACK_OMNIKEY_MODELS = [
    "gemini-2.5-flash",
    "llama-3.3-70b-versatile",
    "gemini-2.5-flash-lite",
    "qwen/qwen3-32b",
]
DEFAULT_OMNIKEY_BASE = os.getenv("OMNIKEY_BASE_URL", "https://omnikey-ai-unified-key-manager.onrender.com/v1beta")
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
FALLBACK_GROQ_MODELS = ["qwen/qwen3.8-27b"]
DEFAULT_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:32b")
DEFAULT_OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")


def safe_parse_json(content: str) -> Any:
    """Parses JSON with automatic extraction and repair for conversational preambles, unescaped quotes, or truncated syntax."""
    if not content:
        raise ValueError("Received empty content to parse as JSON.")

    content = content.strip()

    # 1. If wrapped in markdown code fence anywhere, extract the inner block
    code_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    candidate = code_block.group(1).strip() if code_block else content

    if not candidate:
        raise ValueError("Received empty or whitespace response from LLM; cannot parse JSON.")

    # 2. Try direct json.loads on candidate
    initial_err = None
    try:
        return json.loads(candidate)
    except Exception as err:
        initial_err = err

    # 3. Extract JSON object or array slice
    first_curly = candidate.find("{")
    last_curly = candidate.rfind("}")
    first_square = candidate.find("[")
    last_square = candidate.rfind("]")

    slices = []
    if first_curly != -1 and last_curly > first_curly:
        slices.append(candidate[first_curly : last_curly + 1])
    if first_square != -1 and last_square > first_square:
        slices.append(candidate[first_square : last_square + 1])
    # Handle truncated JSON (starts with { or [ but was cut off before closing)
    if first_curly != -1 and last_curly <= first_curly:
        slices.append(candidate[first_curly:])
    if first_square != -1 and last_square <= first_square:
        slices.append(candidate[first_square:])

    # Try extracted slices with json.loads then json_repair
    for s in slices:
        try:
            return json.loads(s)
        except Exception:
            try:
                from json_repair import repair_json
                repaired = repair_json(s)
                if repaired:
                    parsed = json.loads(repaired)
                    if isinstance(parsed, (dict, list)):
                        return parsed
            except Exception:
                pass

    # 4. Try json_repair on candidate or full content
    for text_to_repair in (candidate, content):
        try:
            from json_repair import repair_json
            repaired = repair_json(text_to_repair)
            if repaired:
                parsed = json.loads(repaired)
                if isinstance(parsed, (dict, list)):
                    return parsed
        except Exception:
            pass

    raise initial_err or ValueError(f"Could not parse valid JSON from: {content[:100]}")


class BaseLLMClient:
    """Base interface for ArcGen LLM clients."""

    def is_available(self) -> bool:
        raise NotImplementedError

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        target_schema: Optional[Type[T]] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
    ) -> Any:
        raise NotImplementedError


class GroqClient(BaseLLMClient):
    """Ultra-fast Groq Cloud API client with structured JSON output."""

    def __init__(self, api_key: Optional[str] = None, model: str = DEFAULT_GROQ_MODEL):
        self.api_key = api_key or os.getenv("GROQ_API_KEY") or os.getenv("groq")
        if not self.api_key:
            raise ValueError(
                "GroqClient requires GROQ_API_KEY. Set it in environment or in generation/ArcGen/.env"
            )
        self.model = model
        self.active_model = model
        self.endpoint = "https://api.groq.com/openai/v1/chat/completions"
        self.models_endpoint = "https://api.groq.com/openai/v1/models"

    def is_available(self) -> bool:
        """Check if Groq API endpoint responds with the given credentials."""
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            r = requests.get(self.models_endpoint, headers=headers, timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        target_schema: Optional[Type[T]] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
    ) -> Any:
        """Queries Groq API with JSON mode and parses/validates against Pydantic schema."""
        # Groq json_object mode requires the word 'json' in messages
        sys_p = system_prompt
        if "json" not in sys_p.lower():
            sys_p += "\nYou must format your entire response as a valid JSON object."

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.active_model,
            "messages": [
                {"role": "system", "content": sys_p},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": temperature,
            "max_tokens": max_tokens or 2048,
        }

        max_retries = 8
        response = None
        attempt = 0
        while attempt < max_retries:
            response = requests.post(self.endpoint, headers=headers, json=payload, timeout=60)
            if response.status_code == 429:
                wait_time = 15.0
                retry_after_hdr = response.headers.get("retry-after")
                if retry_after_hdr:
                    try:
                        wait_time = float(retry_after_hdr) + 1.0
                    except Exception:
                        pass
                else:
                    try:
                        err_msg = response.json().get("error", {}).get("message", "")
                        match = re.search(r"try again in (?:(\d+)m)?([\d\.]+)s", err_msg)
                        if match:
                            minutes = float(match.group(1)) if match.group(1) else 0.0
                            seconds = float(match.group(2))
                            wait_time = (minutes * 60.0) + seconds + 1.0
                    except Exception:
                        pass

                # If wait time is excessive (> 60s, e.g. Daily Token Limit TPD reached), failover seamlessly
                if wait_time > 60.0:
                    switched = False
                    for fallback in FALLBACK_GROQ_MODELS:
                        if fallback != payload["model"]:
                            print(
                                f"\n[Groq Quota Failover] Daily limit/extended pause reached for '{payload['model']}' "
                                f"(wait: {wait_time:.1f}s). Seamlessly switching to '{fallback}'..."
                            )
                            payload["model"] = fallback
                            self.active_model = fallback
                            switched = True
                            time.sleep(1)
                            break
                    if switched:
                        continue

                print(f"\n[Groq TPM Window] Token bucket filling, pausing {wait_time:.1f}s before resuming...")
                time.sleep(wait_time)
                attempt += 1
                continue
            elif response.status_code == 400 and attempt < max_retries - 1:
                try:
                    err_data = response.json().get("error", {})
                    if err_data.get("code") == "json_validate_failed" and err_data.get("failed_generation") == "":
                        current_max = payload.get("max_tokens", 2048)
                        new_max = min(current_max + 1500, 4096)
                        if new_max > current_max:
                            payload["max_tokens"] = new_max
                            print(f"\n[Groq Token Headroom] Extended max_tokens to {new_max}, retrying...")
                            time.sleep(1)
                            attempt += 1
                            continue
                except Exception:
                    pass
                raise RuntimeError(
                    f"Groq API Error (Status {response.status_code}): {response.text}"
                )
            elif response.status_code != 200:
                raise RuntimeError(
                    f"Groq API Error (Status {response.status_code}): {response.text}"
                )
            break

        if response is None or response.status_code != 200:
            raise RuntimeError("Groq API failed after retries.")

        resp_data = response.json()
        content = resp_data["choices"][0]["message"]["content"].strip()

        data = safe_parse_json(content)

        if target_schema is not None:
            return target_schema.model_validate(data)

        return data


class OllamaClient(BaseLLMClient):
    """Local or self-hosted Ollama client with structured JSON schema support."""

    def __init__(self, model: str = DEFAULT_OLLAMA_MODEL, host: str = DEFAULT_OLLAMA_HOST):
        import ollama
        self.model = model
        self.host = host
        self.client = ollama.Client(host=self.host)

    def is_available(self) -> bool:
        """Check if Ollama server is responding."""
        try:
            self.client.list()
            return True
        except Exception:
            return False

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        target_schema: Optional[Type[T]] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
    ) -> Any:
        """Queries Ollama and parses response as JSON, optionally validating against Pydantic schema."""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        options = {"temperature": temperature}
        if max_tokens is not None:
            options["num_predict"] = max_tokens

        response = self.client.chat(
            model=self.model,
            messages=messages,
            format="json",
            options=options,
        )

        content = response["message"]["content"].strip()

        data = safe_parse_json(content)

        if target_schema is not None:
            return target_schema.model_validate(data)

        return data


class OmniKeyClient(BaseLLMClient):
    """Unified AI Gateway client using Google Gemini v1beta protocol."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: str = DEFAULT_OMNIKEY_MODEL,
    ):
        self.api_key = api_key or os.getenv("OMNIKEY_API_KEY") or os.getenv("omnikey")
        self.base_url = (base_url or os.getenv("OMNIKEY_BASE_URL") or DEFAULT_OMNIKEY_BASE).rstrip("/")
        self.model = model
        self.active_model = model
        if not self.api_key:
            raise ValueError("OmniKeyClient requires OMNIKEY_API_KEY.")

    def is_available(self) -> bool:
        """Check if OmniKey gateway is reachable."""
        try:
            url = f"{self.base_url}/models?key={self.api_key}"
            headers = {"x-goog-api-key": self.api_key}
            r = requests.get(url, headers=headers, timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        target_schema: Optional[Type[T]] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
    ) -> Any:
        models_to_try = [self.active_model]
        for m in FALLBACK_OMNIKEY_MODELS:
            if m not in models_to_try:
                models_to_try.append(m)

        enhanced_system_prompt = (
            f"{system_prompt}\n\n"
            "CRITICAL INSTRUCTION: Output valid, raw JSON ONLY. "
            "Do NOT include any conversational text, thought process, reasoning, markdown explanations, or commentary. "
            "Your output must start immediately with '{' or '[' and end with '}' or ']'."
        )

        last_error = None
        for model_candidate in models_to_try:
            url = f"{self.base_url}/models/{model_candidate}:generateContent?key={self.api_key}"
            headers = {
                "x-goog-api-key": self.api_key,
                "Content-Type": "application/json",
            }

            payload = {
                "systemInstruction": {"parts": [{"text": enhanced_system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens or 8192,
                    "thinkingConfig": {"thinkingBudget": 0},
                },
                "safetySettings": [
                    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
                ],
            }

            max_retries = 2
            response = None
            for attempt in range(max_retries):
                try:
                    response = requests.post(url, headers=headers, json=payload, timeout=60)
                    if response.status_code == 200:
                        break
                    elif response.status_code == 429:
                        time.sleep(3)
                        continue
                    else:
                        logger.warning(f"OmniKey error for model '{model_candidate}' (Status {response.status_code}): {response.text[:200]}")
                        time.sleep(1)
                except Exception as e:
                    logger.warning(f"OmniKey request error for model '{model_candidate}': {e}")
                    time.sleep(1)

            if response is None or response.status_code != 200:
                status_code = getattr(response, "status_code", "unknown")
                text = getattr(response, "text", "no response")
                last_error = RuntimeError(f"OmniKey API failed for '{model_candidate}' (Status {status_code}): {text[:200]}")
                if model_candidate != models_to_try[-1]:
                    next_model = models_to_try[models_to_try.index(model_candidate) + 1]
                    print(f"\n[OmniKey Failover] Model '{model_candidate}' unavailable (Status {status_code}). Switching to '{next_model}'...")
                continue

            try:
                resp_json = response.json()
            except Exception as e:
                last_error = RuntimeError(f"OmniKey response JSON decode failed for '{model_candidate}': {e}")
                continue

            candidates = resp_json.get("candidates", [])
            if not candidates:
                last_error = RuntimeError(f"OmniKey returned no candidates for '{model_candidate}': {response.text[:200]}")
                if model_candidate != models_to_try[-1]:
                    next_model = models_to_try[models_to_try.index(model_candidate) + 1]
                    print(f"\n[OmniKey Failover] Model '{model_candidate}' returned no candidates. Switching to '{next_model}'...")
                continue

            finish_reason = candidates[0].get("finishReason")
            parts = candidates[0].get("content", {}).get("parts", [])
            raw_text = parts[0].get("text", "").strip() if parts else ""
            if not raw_text:
                last_error = RuntimeError(f"OmniKey returned empty response text for '{model_candidate}' (finishReason: {finish_reason})")
                if model_candidate != models_to_try[-1]:
                    next_model = models_to_try[models_to_try.index(model_candidate) + 1]
                    print(f"\n[OmniKey Failover] Model '{model_candidate}' returned empty response text. Switching to '{next_model}'...")
                continue

            try:
                data = safe_parse_json(raw_text)
                if target_schema is not None:
                    data = target_schema.model_validate(data)
                if self.active_model != model_candidate:
                    logger.info(f"Switched active OmniKey model to '{model_candidate}'")
                    self.active_model = model_candidate
                return data
            except Exception as parse_err:
                logger.warning(f"OmniKey model '{model_candidate}' output could not be parsed: {parse_err}")
                last_error = parse_err
                if model_candidate != models_to_try[-1]:
                    next_model = models_to_try[models_to_try.index(model_candidate) + 1]
                    print(f"\n[OmniKey Failover] Output parsing failed on '{model_candidate}'. Switching to '{next_model}'...")

        raise last_error or RuntimeError("All OmniKey models failed.")


class ResilientLLMClient(BaseLLMClient):
    """Multi-tier client that cascades: OmniKey -> Groq -> Local Ollama."""

    def __init__(self, clients: List[BaseLLMClient]):
        self.clients = [c for c in clients if c is not None]
        if not self.clients:
            raise ValueError("ResilientLLMClient requires at least one client.")

    @property
    def active_client(self) -> BaseLLMClient:
        return self.clients[0]

    @property
    def model(self) -> str:
        return getattr(self.active_client, "model", "multi-tier")

    def is_available(self) -> bool:
        return any(c.is_available() for c in self.clients)

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        target_schema: Optional[Type[T]] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
    ) -> Any:
        last_error = None
        for i, client in enumerate(self.clients):
            client_name = type(client).__name__
            try:
                return client.generate_json(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    target_schema=target_schema,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
            except Exception as e:
                last_error = e
                logger.warning(f"Tier {i+1} ({client_name}) failed: {e}")
                if i < len(self.clients) - 1:
                    next_client = self.clients[i+1]
                    next_name = type(next_client).__name__
                    print(f"\n[LLM Failover] {client_name} encountered an issue ({e}). Falling back to Tier {i+2}: {next_name}...")

        raise RuntimeError(f"All LLM tiers failed. Last error: {last_error}")


def get_llm_client(
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> BaseLLMClient:
    """Factory creating an LLM client based on environment or explicit preference.
    
    Order of preference when provider is None:
    Builds a ResilientLLMClient cascading:
    1. OmniKey (if OMNIKEY_API_KEY / omnikey in .env exists)
    2. Groq (if GROQ_API_KEY / groq in .env exists)
    3. Ollama (local fallback)
    """
    selected_provider = provider or os.getenv("LLM_PROVIDER")

    if selected_provider:
        p = selected_provider.lower().strip()
        if p == "omnikey":
            m = model or DEFAULT_OMNIKEY_MODEL
            logger.info(f"Initialized OmniKey LLM Client (model: {m})")
            return OmniKeyClient(model=m)
        elif p == "groq":
            m = model or DEFAULT_GROQ_MODEL
            logger.info(f"Initialized Groq LLM Client (model: {m})")
            return GroqClient(model=m)
        elif p == "ollama":
            m = model or DEFAULT_OLLAMA_MODEL
            logger.info(f"Initialized Ollama LLM Client (model: {m}, host: {DEFAULT_OLLAMA_HOST})")
            return OllamaClient(model=m)
        else:
            raise ValueError(f"Unknown LLM provider '{selected_provider}'. Choose 'omnikey', 'groq', or 'ollama'.")

    # Build Multi-Tier Resilient Client
    tier_clients: List[BaseLLMClient] = []

    has_omnikey = bool(os.getenv("OMNIKEY_API_KEY") or os.getenv("omnikey"))
    if has_omnikey:
        try:
            tier_clients.append(OmniKeyClient(model=model or DEFAULT_OMNIKEY_MODEL))
        except Exception as e:
            logger.warning(f"Could not initialize OmniKey tier: {e}")

    has_groq = bool(os.getenv("GROQ_API_KEY") or os.getenv("groq"))
    if has_groq:
        try:
            tier_clients.append(GroqClient(model=model or DEFAULT_GROQ_MODEL))
        except Exception as e:
            logger.warning(f"Could not initialize Groq tier: {e}")

    # Always attach local Ollama as final safety net
    try:
        tier_clients.append(OllamaClient(model=DEFAULT_OLLAMA_MODEL))
    except Exception as e:
        logger.warning(f"Could not initialize Ollama fallback: {e}")

    if len(tier_clients) == 1:
        return tier_clients[0]
    elif len(tier_clients) > 1:
        return ResilientLLMClient(tier_clients)

    # If nothing was configured, default to Ollama
    return OllamaClient()
