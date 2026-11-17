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
from typing import Any, Callable, Dict, List, Optional, Type, TypeVar, Union
from pydantic import BaseModel
import requests

from app import llm_settings
from app.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# --- Automatic .env Loader ---
def _load_env_files():
    """Loads .env files (service dir, copilot_ide/, repo root) into os.environ; earlier files win."""
    parents = Path(__file__).resolve().parents
    # arcgen_service/, copilot_ide/, repo root (fewer levels exist inside the Docker image)
    candidates = [parents[i] / ".env" for i in (1, 3, 4) if i < len(parents)]
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
]
DEFAULT_OMNIKEY_BASE = os.getenv("OMNIKEY_BASE_URL", "https://omnikey-ai-unified-key-manager.onrender.com/v1beta")
DEFAULT_GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
FALLBACK_GROQ_MODELS = ["qwen/qwen3.8-27b"]
_OLLAMA_MODEL_ENV = os.getenv("OLLAMA_MODEL") or os.getenv("DEFAULT_MODEL")
DEFAULT_OLLAMA_MODEL = _OLLAMA_MODEL_ENV or "qwen2.5-coder:32b"
def _normalize_ollama_host(raw: str) -> str:
    """OLLAMA_HOST is often a server bind address ("0.0.0.0", "0.0.0.0:11434"); make it a client URL."""
    host = raw.strip() or "http://localhost:11434"
    if "://" not in host:
        host = "http://" + host
    host = host.replace("://0.0.0.0", "://localhost")
    if host.startswith("https://"):
        return host
    if host.count(":") == 1:  # scheme only, no port
        host += ":11434"
    return host


def get_ollama_host() -> str:
    path = Path("/tmp/ollama_host.txt")
    if path.exists():
        try:
            val = path.read_text(encoding="utf-8").strip()
            if val.startswith("http"):
                return _normalize_ollama_host(val)
        except Exception:
            pass
    return _normalize_ollama_host(os.getenv("OLLAMA_HOST", os.getenv("OLLAMA_URL", "http://localhost:11434")))

DEFAULT_OLLAMA_HOST = get_ollama_host()
_ollama_default_cache: Dict[str, Any] = {"at": 0.0, "model": None}


def ollama_default_model() -> str:
    """Ollama model to use when none is chosen in the UI.

    An explicit OLLAMA_MODEL / DEFAULT_MODEL env always wins. Otherwise the built-in default is used
    only if it is installed; if not, the first locally installed model is picked so a missing
    default never blocks Ollama. Cached briefly; falls back to the built-in name if Ollama is down.
    """
    if _OLLAMA_MODEL_ENV:
        return _OLLAMA_MODEL_ENV
    now = time.monotonic()
    if _ollama_default_cache["model"] and now - _ollama_default_cache["at"] < 30:
        return _ollama_default_cache["model"]
    try:
        r = requests.get(f"{get_ollama_host().rstrip('/')}/api/tags", timeout=3)
        r.raise_for_status()
        installed = sorted(m["name"] for m in r.json().get("models", []))
    except Exception:
        return DEFAULT_OLLAMA_MODEL
    model = DEFAULT_OLLAMA_MODEL if (DEFAULT_OLLAMA_MODEL in installed or not installed) else installed[0]
    _ollama_default_cache.update(at=now, model=model)
    return model


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

    def supports_tools(self) -> bool:
        """True when run_tools is implemented (native function calling)."""
        return False

    def run_tools(
        self,
        system_prompt: str,
        user_prompt: str,
        registry: "ToolRegistry",
        final_tool: str,
        temperature: float = 0.1,
        max_steps: int = 6,
        on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Optional[dict]:
        """Run a tool-calling loop; return the parsed args of the final tool call, or None."""
        raise NotImplementedError


class _Early:
    """Wraps a value that short-circuits a retry loop."""

    def __init__(self, value: Any):
        self.value = value


_RETRY = object()


class GroqClient(BaseLLMClient):
    """Ultra-fast Groq Cloud API client with structured JSON output."""

    def __init__(self, api_key: Optional[str] = None, model: str = DEFAULT_GROQ_MODEL):
        self.api_key = api_key or os.getenv("GROQ_API_KEY") or os.getenv("groq")
        if not self.api_key:
            raise ValueError(
                "GroqClient requires GROQ_API_KEY. Set it in the environment or in a .env file"
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

    def _post_with_retry(
        self,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        max_retries: int = 8,
        on_400: Optional[Callable[[Any, int], Any]] = None,
    ) -> Any:
        """POST with 429 handling (retry-after / quota model failover). Returns the 200 response.

        on_400(response, attempt) may return _Early(value) to short-circuit, _RETRY to retry,
        or None to fail. Mutates payload["model"] and self.active_model on failover.
        """
        response = None
        attempt = 0
        while attempt < max_retries:
            response = requests.post(self.endpoint, headers=headers, json=payload, timeout=None)
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
            elif response.status_code == 400 and on_400 is not None and attempt < max_retries - 1:
                handled = on_400(response, attempt)
                if isinstance(handled, _Early):
                    return handled
                if handled is _RETRY:
                    attempt += 1
                    continue
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
        return response

    def supports_tools(self) -> bool:
        return True

    def run_tools(
        self,
        system_prompt: str,
        user_prompt: str,
        registry: ToolRegistry,
        final_tool: str,
        temperature: float = 0.1,
        max_steps: int = 6,
        on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Optional[dict]:
        """OpenAI-format tool loop. Returns the final tool's args, or None (step cap / plain-text answer)."""
        def emit(ev: Dict[str, Any]) -> None:
            if on_event is not None:
                try:
                    on_event(ev)
                except Exception:
                    logger.debug("on_event callback failed", exc_info=True)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        payload: Dict[str, Any] = {
            "model": self.active_model,
            "messages": messages,
            "tools": registry.openai_schemas(),
            "tool_choice": "auto",
            "temperature": temperature,
        }

        def force_final() -> None:
            # Offer ONLY the terminal tool and force it. Groq rejects (400 tool_use_failed) a forced
            # call when the model still emits another tool, so the other tools are removed too.
            payload["tools"] = [t for t in registry.openai_schemas() if t["function"]["name"] == final_tool]
            payload["tool_choice"] = {"type": "function", "function": {"name": final_tool}}

        def on_400(response: Any, attempt: int) -> Any:
            """Groq rejects malformed tool calls with 400 tool_use_failed; hand them to the loop to recover."""
            try:
                err = response.json().get("error", {})
                if err.get("code") != "tool_use_failed":
                    return None
                try:
                    gen = safe_parse_json(err.get("failed_generation", ""))
                except Exception:
                    gen = None
                return _Early({"tool_use_failed": gen if isinstance(gen, dict) else None,
                               "message": str(err.get("message", ""))[:300]})
            except Exception:
                return None

        def run_call(call_id: str, name: str, raw_args: Any) -> Optional[dict]:
            """Dispatch one call, record it in the conversation; return final args when the loop is done."""
            try:
                shown = json.loads(raw_args) if isinstance(raw_args, str) and raw_args.strip() else raw_args
            except Exception:
                shown = raw_args
            emit({"type": "tool_call", "name": name, "args": shown})
            result = registry.dispatch(name, raw_args)
            emit({"type": "tool_result", "name": name, "result": result})
            if name == final_tool and isinstance(shown, dict):
                try:
                    failed = "error" in json.loads(result)
                except Exception:
                    failed = False
                if not failed:
                    return shown
            messages.append({"role": "tool", "tool_call_id": call_id, "content": result})
            return None

        nudged = False
        for step in range(max_steps):
            if step == max_steps - 1:
                force_final()  # last step: make the loop end with an answer
            emit({"type": "step", "n": step + 1, "forced": payload["tool_choice"] != "auto"})
            response = self._post_with_retry(payload, headers, on_400=on_400)
            if isinstance(response, _Early):
                failed = response.value
                gen = failed["tool_use_failed"]
                name = gen.get("name") if gen else None
                emit({"type": "tool_use_failed", "name": name, "message": failed["message"]})
                if name in registry:
                    # Recoverable: run the call ourselves and keep the conversation going.
                    call_id = f"recovered_{step + 1}"
                    args = gen.get("arguments", {})
                    raw = args if isinstance(args, str) else json.dumps(args)
                    messages.append({"role": "assistant", "content": None, "tool_calls": [
                        {"id": call_id, "type": "function", "function": {"name": name, "arguments": raw}}]})
                    done = run_call(call_id, name, raw)
                    if done is not None:
                        return done
                else:
                    messages.append({"role": "user", "content":
                                     f"Your last tool call was invalid ({failed['message']}). "
                                     f"Use only the provided tools with their exact parameters."})
                continue
            msg = response.json()["choices"][0]["message"]
            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                # Plain-text answer: nudge once and force the terminal tool, then give up.
                if nudged or step == max_steps - 1:
                    return None
                nudged = True
                emit({"type": "nudge", "content": (msg.get("content") or "")[:200]})
                messages.append({"role": "assistant", "content": msg.get("content") or ""})
                messages.append({"role": "user", "content": f"Do not answer in text. Call {final_tool} now with the complete result."})
                force_final()
                continue
            # Echo only the fields the API accepts back (drops e.g. reasoning extras).
            messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": tool_calls})
            for call in tool_calls:
                fn = call.get("function", {})
                done = run_call(call.get("id", ""), fn.get("name", ""), fn.get("arguments", ""))
                if done is not None:
                    return done
        return None

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
        payload: Dict[str, Any] = {
            "model": self.active_model,
            "messages": [
                {"role": "system", "content": sys_p},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        def on_400(response: Any, attempt: int) -> Any:
            """json_validate_failed handling (generate_json specific)."""
            try:
                err_data = response.json().get("error", {})
                if err_data.get("code") == "json_validate_failed":
                    failed_gen = err_data.get("failed_generation", "")
                    if failed_gen:
                        try:
                            parsed = safe_parse_json(failed_gen)
                            if target_schema is not None:
                                return _Early(target_schema.model_validate(parsed))
                            return _Early(parsed)
                        except Exception:
                            pass
                    current_max = payload.get("max_tokens", 4096)
                    new_max = current_max + 2048
                    payload["max_tokens"] = new_max
                    print(f"\n[Groq Token Headroom] Extended max_tokens to {new_max}, retrying...")
                    time.sleep(1)
                    return _RETRY
            except Exception:
                pass
            return None

        response = self._post_with_retry(payload, headers, on_400=on_400)
        if isinstance(response, _Early):
            return response.value

        resp_data = response.json()
        content = resp_data["choices"][0]["message"]["content"].strip()

        data = safe_parse_json(content)

        if target_schema is not None:
            return target_schema.model_validate(data)

        return data


class OllamaClient(BaseLLMClient):
    """Local or self-hosted Ollama client with structured JSON schema support."""

    def __init__(self, model: Optional[str] = None, host: str = DEFAULT_OLLAMA_HOST):
        import ollama
        self.model = model or ollama_default_model()
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

            gen_config: Dict[str, Any] = {
                "responseMimeType": "application/json",
                "temperature": temperature,
                "thinkingConfig": {"thinkingBudget": 0},
            }
            if max_tokens is not None:
                gen_config["maxOutputTokens"] = max_tokens

            payload = {
                "systemInstruction": {"parts": [{"text": enhanced_system_prompt}]},
                "contents": [{"parts": [{"text": user_prompt}]}],
                "generationConfig": gen_config,
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
                    response = requests.post(url, headers=headers, json=payload, timeout=None)
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
        # Models that actually produced an answer (the jury excludes their families).
        self.used_models: List[str] = []

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
                result = client.generate_json(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    target_schema=target_schema,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                used = str(getattr(client, "model", client_name))
                if used not in self.used_models:
                    self.used_models.append(used)
                return result
            except Exception as e:
                last_error = e
                logger.warning(f"Tier {i+1} ({client_name}) failed: {e}")
                if i < len(self.clients) - 1:
                    next_client = self.clients[i+1]
                    next_name = type(next_client).__name__
                    print(f"\n[LLM Failover] {client_name} encountered an issue ({e}). Falling back to Tier {i+2}: {next_name}...")

        raise RuntimeError(f"All LLM tiers failed. Last error: {last_error}")

    def supports_tools(self) -> bool:
        return any(c.supports_tools() for c in self.clients)

    def run_tools(
        self,
        system_prompt: str,
        user_prompt: str,
        registry: ToolRegistry,
        final_tool: str,
        temperature: float = 0.1,
        max_steps: int = 6,
        on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Optional[dict]:
        """Whole-loop failover across tool-capable clients (never switches provider mid-conversation)."""
        last_error = None
        capable = [c for c in self.clients if c.supports_tools()]
        for i, client in enumerate(capable):
            client_name = type(client).__name__
            try:
                result = client.run_tools(
                    system_prompt, user_prompt, registry, final_tool,
                    temperature=temperature, max_steps=max_steps, on_event=on_event,
                )
                used = str(getattr(client, "model", client_name))
                if used not in self.used_models:
                    self.used_models.append(used)
                return result
            except Exception as e:
                last_error = e
                logger.warning(f"Tool tier {i+1} ({client_name}) failed: {e}")
        raise RuntimeError(f"No tool-capable LLM tier succeeded. Last error: {last_error}")


def format_feedback(feedback: Optional[List[str]]) -> str:
    """Renders jury findings as a prompt section the generator must address (empty when none)."""
    if not feedback:
        return ""
    lines = "\n".join(f"- {f}" for f in feedback)
    return f"\n\nREVIEW FINDINGS FROM THE PREVIOUS ATTEMPT (fix every one of these):\n{lines}"


def default_model(provider: str) -> str:
    if provider == "ollama":
        return ollama_default_model()
    return {"omnikey": DEFAULT_OMNIKEY_MODEL, "groq": DEFAULT_GROQ_MODEL}[provider]


def provider_of(client: BaseLLMClient) -> str:
    return {OmniKeyClient: "omnikey", GroqClient: "groq", OllamaClient: "ollama"}.get(type(client), type(client).__name__)


def build_client(provider: str, model: Optional[str] = None, api_key: Optional[str] = None,
                 settings: Optional["llm_settings.LLMSettings"] = None) -> BaseLLMClient:
    """One provider's client. Model: argument > UI setting > env default; key: argument > UI > env."""
    s = settings or llm_settings.load()
    p = provider.lower().strip()
    if p not in llm_settings.PROVIDERS:
        raise ValueError(f"Unknown LLM provider '{provider}'. Choose 'omnikey', 'groq', or 'ollama'.")
    m = model or s.models.get(p) or default_model(p)
    if p == "ollama":
        return OllamaClient(model=m)
    key = api_key or llm_settings.api_key(p, s)[0]
    return OmniKeyClient(api_key=key, model=m) if p == "omnikey" else GroqClient(api_key=key, model=m)


def get_llm_client(
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> BaseLLMClient:
    """Factory for the generator's LLM client.

    Provider: argument > choice saved in the ArcGen UI (app/llm_settings.py) > LLM_PROVIDER env.
    With none of those (UI "auto"), builds a ResilientLLMClient cascading
      1. OmniKey (key from the UI or OMNIKEY_API_KEY / omnikey)
      2. Groq    (key from the UI or GROQ_API_KEY / groq)
      3. Ollama  (always, local fallback)
    """
    s = llm_settings.load()
    ui_provider = s.provider if s.provider != "auto" else None
    selected_provider = provider or ui_provider or os.getenv("LLM_PROVIDER")

    if selected_provider:
        client = build_client(selected_provider, model=model, settings=s)
        logger.info(f"Initialized {type(client).__name__} (model: {getattr(client, 'model', '?')})")
        return client

    tier_clients: List[BaseLLMClient] = []
    for p in llm_settings.KEY_PROVIDERS:
        if llm_settings.api_key(p, s)[0]:
            try:
                tier_clients.append(build_client(p, model=model, settings=s))
            except Exception as e:
                logger.warning(f"Could not initialize {p} tier: {e}")

    # Always attach local Ollama as final safety net
    try:
        tier_clients.append(build_client("ollama", settings=s))
    except Exception as e:
        logger.warning(f"Could not initialize Ollama fallback: {e}")

    if len(tier_clients) == 1:
        return tier_clients[0]
    elif len(tier_clients) > 1:
        return ResilientLLMClient(tier_clients)

    # If nothing was configured, default to Ollama
    return OllamaClient()
