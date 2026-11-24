"""LangGraph healing workflow (gather -> plan -> patch -> verify -> approval pause -> finalize).

LangGraph is imported lazily inside `_build_graph()` so containers built without
`langgraph` can still import the conformance studio router and run audits cleanly.
"""
from __future__ import annotations

import ast
import json
import os
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TypedDict

from conformance.classifier_agent import (
    API_KEYS_FILE,
    DEFAULT_FREELLMAPI_URL,
    load_ide_keys,
    normalize_freellmapi_url,
)

from conformance.healing.sandbox import (
    _iter_repo_py_files,
    apply_patches,
    build_diff_previews,
    module_to_relpath,
    read_numbered_source,
    resolve_safe_subpath,
    verify_in_sandbox,
    violation_id_of,
)
from conformance.healing.schemas import (
    FileDiffPreview,
    FilePatch,
    HealingPlan,
    HealingReport,
    PatchSet,
    VerificationResult,
)

DEFAULT_TIME_BUDGET_S = 180.0


def _probe_ollama_model() -> Optional[str]:
    base = (os.getenv("OLLAMA_URL") or os.getenv("OLLAMA_HOST") or "http://host.docker.internal:11434").rstrip("/")
    try:
        raw = urllib.request.urlopen(f"{base}/api/tags", timeout=2.0).read()
        models = [m.get("name", "") for m in json.loads(raw).get("models", []) if m.get("name")]
        if not models:
            return None
        for preferred in ("qwen", "coder", "llama", "gemma"):
            match = next((m for m in models if preferred in m.lower()), None)
            if match:
                return match
        return models[0]
    except Exception:
        return None


def _load_arcgen_keys() -> Dict[str, str]:
    """Load saved keys from ArcGen's persistent llm_settings.json if available."""
    candidates = [
        Path("/workspace/services/arcgen_service/output/llm_settings.json"),
        Path(__file__).resolve().parents[2] / "copilot_ide" / "services" / "arcgen_service" / "output" / "llm_settings.json",
    ]
    for p in candidates:
        if p.is_file():
            try:
                raw = json.loads(p.read_text(encoding="utf-8")).get("keys") or {}
                return {k: str(v).strip() for k, v in raw.items() if isinstance(v, str) and v.strip()}
            except Exception:
                pass
    return {}


def _parse_model_override(model_override: Optional[str]) -> Optional[tuple[str, str]]:
    """Map an IDE LLM picker value (e.g. 'freellmapi:auto:fast', 'gpt-4.1') to (provider, model)."""
    raw = (model_override or "").strip()
    if not raw:
        return None
    low = raw.lower()
    if low.startswith("freellmapi:"):
        sub = raw.split(":", 1)[1].strip() or "auto"
        return "freellmapi", sub
    if low.startswith("groq:"):
        sub = raw.split(":", 1)[1].strip() or "openai/gpt-oss-120b"
        return "groq", sub
    if low.startswith(("openai/gpt-oss-", "qwen/", "allam-", "llama-")):
        return "groq", raw
    if low.startswith(("gpt-", "o1", "o3", "o4")):
        return "openai", raw
    if low.startswith("gemini-"):
        return "gemini", raw
    return "ollama", raw


def _build_candidate_model(prov: str, key: str, base_url: str = "", model_name: str = "") -> Optional[tuple[str, Any]]:
    if prov == "freellmapi":
        if not key:
            return None
        from langchain_openai import ChatOpenAI

        resolved_url = normalize_freellmapi_url(base_url)
        resolved_model = (model_name or "auto").strip() or "auto"
        low = resolved_model.lower()
        timeout_s = 30.0 if "fast" in low else (50.0 if "smart" in low else 35.0)
        return f"freellmapi:{resolved_model}", ChatOpenAI(
            model=resolved_model,
            temperature=0.1,
            api_key=key,
            base_url=resolved_url,
            max_retries=0,
            timeout=timeout_s,
        )
    if prov == "openai":
        if not key:
            return None
        from langchain_openai import ChatOpenAI

        resolved_model = (model_name or "gpt-4o-mini").strip() or "gpt-4o-mini"
        return f"openai:{resolved_model}", ChatOpenAI(
            model=resolved_model, temperature=0.1, api_key=key, max_retries=0, timeout=45.0
        )
    if prov == "gemini":
        if not key:
            return None
        resolved_model = (model_name or "gemini-3.8-flash").strip() or "gemini-3.8-flash"
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return f"gemini:{resolved_model}", ChatGoogleGenerativeAI(
                model=resolved_model, temperature=0.1, google_api_key=key, max_retries=0, timeout=45.0
            )
        except ImportError:
            from langchain_openai import ChatOpenAI
            return f"gemini:{resolved_model}", ChatOpenAI(
                model=resolved_model,
                temperature=0.1,
                api_key=key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                max_retries=0,
                timeout=45.0,
            )
    if prov == "groq":
        if not key:
            return None
        from langchain_groq import ChatGroq

        resolved_model = (model_name or "openai/gpt-oss-120b").strip() or "openai/gpt-oss-120b"
        return f"groq:{resolved_model}", ChatGroq(
            model=resolved_model, temperature=0.1, groq_api_key=key, max_retries=0, timeout=45.0
        )
    if prov == "nvidia":
        if not key:
            return None
        from langchain_openai import ChatOpenAI

        resolved_model = (model_name or os.getenv("NVIDIA_MODEL") or "meta/llama-3.2-11b-vision-instruct").strip()
        return f"nvidia:{resolved_model}", ChatOpenAI(
            model=resolved_model,
            temperature=0.1,
            api_key=key,
            base_url="https://integrate.api.nvidia.com/v1",
            max_retries=0,
            timeout=45.0,
        )
    if prov == "ollama":
        ollama_model = model_name.strip() if model_name and model_name.strip() else _probe_ollama_model()
        if not ollama_model:
            return None
        if model_name and _probe_ollama_model() is None:
            return None
        from langchain_openai import ChatOpenAI

        base = (os.getenv("OLLAMA_URL") or "http://host.docker.internal:11434").rstrip("/")
        return f"ollama:{ollama_model}", ChatOpenAI(
            model=ollama_model, temperature=0.1, api_key="ollama", base_url=f"{base}/v1", max_retries=0, timeout=60.0
        )
    return None


def resolve_candidate_models(
    provider: Optional[str] = None,
    model_override: Optional[str] = None,
) -> List[tuple[str, Any]]:
    """Return ordered (label, chat_model) candidates across picker selection, IDE Cloud Settings, env keys, and Ollama."""
    ide_keys = load_ide_keys()
    arcgen_keys = _load_arcgen_keys()
    req = (provider or "").strip().lower() or None
    parsed_override = _parse_model_override(model_override)

    fl_env_key = (os.getenv("FREELLMAPI_API_KEY") or "").strip()
    fl_ide_url = ide_keys.get("freellmapi_base_url") or (os.getenv("FREELLMAPI_BASE_URL") or "").strip()
    fl_env_url = (os.getenv("FREELLMAPI_BASE_URL") or "").strip() or ide_keys.get("freellmapi_base_url", "")
    fl_ide_model = ide_keys.get("freellmapi_model") or (os.getenv("FREELLMAPI_MODEL") or "").strip() or "auto"
    fl_env_model = (os.getenv("FREELLMAPI_MODEL") or "").strip() or ide_keys.get("freellmapi_model", "") or "auto"

    raw_specs: List[tuple[str, str, str, str]] = []

    def _add_freellmapi(key: str, base_url: str, preferred_model: str) -> None:
        if not key:
            return
        primary = (preferred_model or "auto").strip() or "auto"
        backup = "auto" if "fast" in primary.lower() else "auto:fast"
        raw_specs.append(("freellmapi", key, base_url, primary))
        raw_specs.append(("freellmapi", key, base_url, backup))

    def _add_groq(key: str, preferred_model: str = "") -> None:
        if not key:
            return
        seen_models: list[str] = []
        for m in (preferred_model, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"):
            clean_m = (m or "").strip()
            if clean_m and clean_m not in seen_models:
                seen_models.append(clean_m)
        for m in seen_models:
            raw_specs.append(("groq", key, "", m))

    if req:
        ov_model = parsed_override[1] if (parsed_override and parsed_override[0] == req) else ""
        if req == "freellmapi":
            _add_freellmapi(ide_keys.get("freellmapi", ""), fl_ide_url, ov_model or fl_ide_model)
            _add_freellmapi(fl_env_key, fl_env_url, ov_model or fl_env_model)
        elif req == "openai":
            raw_specs.append(("openai", ide_keys.get("openai") or (os.getenv("OPENAI_API_KEY") or "").strip(), "", ov_model))
        elif req == "gemini":
            raw_specs.append(("gemini", ide_keys.get("gemini") or (os.getenv("GOOGLE_API_KEY") or "").strip(), "", ov_model))
        elif req == "groq":
            for k in (
                ide_keys.get("groq", ""),
                arcgen_keys.get("groq", ""),
                (os.getenv("GROQ_API_KEY") or "").strip(),
                (os.getenv("GROQ_API_KEY_2") or "").strip(),
            ):
                _add_groq(k, ov_model)
        elif req == "nvidia":
            raw_specs.append(("nvidia", (os.getenv("NVIDIA_API_KEY") or "").strip(), "", ov_model))
        elif req == "ollama":
            raw_specs.append(("ollama", "ollama", "", ov_model))
    else:
        # 1. Explicit IDE picker override comes first when its provider/backend is usable.
        if parsed_override:
            ov_prov, ov_model = parsed_override
            if ov_prov == "freellmapi":
                _add_freellmapi(ide_keys.get("freellmapi", ""), fl_ide_url, ov_model)
                _add_freellmapi(fl_env_key, fl_env_url, ov_model)
            elif ov_prov == "openai":
                k = ide_keys.get("openai") or (os.getenv("OPENAI_API_KEY") or "").strip()
                if k:
                    raw_specs.append(("openai", k, "", ov_model))
            elif ov_prov == "gemini":
                k = ide_keys.get("gemini") or (os.getenv("GOOGLE_API_KEY") or "").strip()
                if k:
                    raw_specs.append(("gemini", k, "", ov_model))
                    if ov_model != "gemini-3.8-flash":
                        raw_specs.append(("gemini", k, "", "gemini-3.8-flash"))
            elif ov_prov == "groq":
                for k in (
                    ide_keys.get("groq", ""),
                    arcgen_keys.get("groq", ""),
                    (os.getenv("GROQ_API_KEY") or "").strip(),
                    (os.getenv("GROQ_API_KEY_2") or "").strip(),
                ):
                    _add_groq(k, ov_model)
            elif ov_prov == "ollama" and _probe_ollama_model():
                raw_specs.append(("ollama", "ollama", "", ov_model))

        # 2. User-saved IDE/ArcGen settings run ahead of fallback .env keys.
        _add_freellmapi(ide_keys.get("freellmapi", ""), fl_ide_url, fl_ide_model)
        _add_freellmapi(fl_env_key, fl_env_url, fl_env_model)
        if ide_keys.get("openai"):
            raw_specs.append(("openai", ide_keys["openai"], "", ""))
        if ide_keys.get("gemini"):
            raw_specs.append(("gemini", ide_keys["gemini"], "", ""))
        if ide_keys.get("groq"):
            _add_groq(ide_keys["groq"])
        if arcgen_keys.get("groq"):
            _add_groq(arcgen_keys["groq"])
        for prov, env_name in (
            ("openai", "OPENAI_API_KEY"),
            ("gemini", "GOOGLE_API_KEY"),
            ("groq", "GROQ_API_KEY"),
            ("groq", "GROQ_API_KEY_2"),
            ("nvidia", "NVIDIA_API_KEY"),
        ):
            val = (os.getenv(env_name) or "").strip()
            if val:
                if prov == "groq":
                    _add_groq(val)
                else:
                    raw_specs.append((prov, val, "", ""))
        raw_specs.append(("ollama", "ollama", "", ""))

    models: List[tuple[str, Any]] = []
    errors: List[str] = []
    seen: set[tuple[str, str, str, str]] = set()
    for prov, key, base_url, model_name in raw_specs:
        if not key:
            continue
        sig = (prov, key, base_url, model_name)
        if sig in seen:
            continue
        seen.add(sig)
        try:
            built = _build_candidate_model(prov, key, base_url=base_url, model_name=model_name)
            if built:
                models.append(built)
        except Exception as exc:
            errors.append(f"{prov}: {exc}")

    if not models:
        detail = f" ({'; '.join(errors)})" if errors else ""
        raise RuntimeError(
            "No usable LLM provider for healing. Configure FreeLLMAPI / OpenAI / Gemini in IDE Cloud Settings, "
            f"set FREELLMAPI_API_KEY / GROQ_API_KEY, or start Ollama locally{detail}."
        )
    return models


def resolve_chat_model(provider: Optional[str] = None) -> tuple[str, Any]:
    """Resolve the highest-priority LangChain chat model across IDE Cloud Settings, env keys, and Ollama."""
    return resolve_candidate_models(provider)[0]


def _is_request_too_large(exc: Exception) -> bool:
    """True when the provider rejected the payload size (HTTP 413)."""
    if getattr(exc, "status_code", None) == 413:
        return True
    msg = str(exc).lower()
    return "error code: 413" in msg or "request too large" in msg


def _is_provider_failure(exc: Exception) -> bool:
    """True when an exception indicates auth, quota, network, or provider unavailability (not schema formatting)."""
    status_code = getattr(exc, "status_code", None)
    if status_code in (401, 403, 404, 408, 410, 413, 429, 500, 502, 503, 504):
        return True
    cls_name = type(exc).__name__.lower()
    if any(
        tok in cls_name
        for tok in (
            "authentication",
            "permission",
            "ratelimit",
            "apiconnection",
            "apitimeout",
            "connect",
            "timeout",
            "notfound",
            "internalserver",
        )
    ):
        return True
    msg = str(exc).lower()
    return any(
        tok in msg
        for tok in (
            "invalid api key",
            "invalid_api_key",
            "expired_api_key",
            "invalid auth key",
            "does not exist",
            "authentication",
            "unauthorized",
            "error code: 401",
            "error code: 403",
            "error code: 410",
            "error code: 413",
            "error code: 429",
            "request too large",
            "end of life",
            "no longer available",
            "decommissioned",
            "rate limit",
            "insufficient_quota",
            "connection refused",
            "connection error",
            "timed out",
        )
    )


def _parse_json_to_schema(raw_text: str, schema: type):
    text = raw_text.strip()
    if "```" in text:
        blocks = text.split("```")
        if len(blocks) >= 2:
            text = blocks[1]
            if text.lstrip().startswith("json"):
                text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"LLM returned non-JSON for {schema.__name__}: {raw_text[:200]}")
    snippet = text[start : end + 1]
    try:
        import json_repair
        return schema.model_validate(json_repair.loads(snippet))
    except ImportError:
        return schema.model_validate_json(snippet)


def _prefer_direct_json(pname: str, llm: Any) -> bool:
    """Use single-shot JSON mode for multi-provider routers / Ollama / Groq / Gemini to avoid slow 2x tool-call hangs."""
    return pname.startswith(("freellmapi:", "ollama:", "gemini:", "groq:")) and type(llm).__name__ in ("ChatOpenAI", "ChatGroq")


def _invoke_structured_traced(
    llm: Any,
    system_prompt: str,
    user_prompt: str,
    schema: type,
    *,
    prefer_json: bool = False,
) -> tuple[Any, Dict[str, Any]]:
    """Invoke `llm` with schema extraction, returning `(model_obj, trace_meta)`."""
    from langchain_core.messages import HumanMessage, SystemMessage

    json_hint = (
        f"\n\nRespond ONLY with a valid JSON object matching this JSON schema (no prose outside JSON):\n"
        f"{json.dumps(schema.model_json_schema(), indent=1)}"
    )
    meta: Dict[str, Any] = {"mode": "json" if prefer_json else "structured"}

    def _raw_json_call() -> Any:
        raw_msg = llm.invoke([SystemMessage(content=system_prompt + json_hint), HumanMessage(content=user_prompt)])
        resp_meta = getattr(raw_msg, "response_metadata", None) or {}
        if isinstance(resp_meta, dict):
            routed = resp_meta.get("model_name") or resp_meta.get("model")
            if routed:
                meta["routed_model"] = str(routed)
            usage = resp_meta.get("token_usage") or resp_meta.get("usage")
            if isinstance(usage, dict):
                meta["tokens"] = usage.get("total_tokens")
        return _parse_json_to_schema(str(getattr(raw_msg, "content", raw_msg) or ""), schema)

    if prefer_json:
        try:
            return _raw_json_call(), meta
        except Exception as exc:
            if _is_provider_failure(exc):
                raise
            # One fast fallback to tool-calling structured output if raw JSON validation failed.
            meta["mode"] = "structured_fallback"
            structured = llm.with_structured_output(schema)
            out = structured.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
            return (out if isinstance(out, schema) else schema.model_validate(out)), meta

    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    try:
        structured = llm.with_structured_output(schema)
        out = structured.invoke(messages)
        parsed = out if isinstance(out, schema) else schema.model_validate(out)
        return parsed, meta
    except Exception as exc:
        if _is_provider_failure(exc):
            raise
        meta["mode"] = "json_fallback"
        return _raw_json_call(), meta


def _invoke_structured(llm: Any, system_prompt: str, user_prompt: str, schema: type):
    """Invoke `llm` with strict Pydantic output, falling back to JSON extraction + json_repair on schema errors."""
    parsed, _ = _invoke_structured_traced(llm, system_prompt, user_prompt, schema, prefer_json=False)
    return parsed


class HealGraphState(TypedDict, total=False):
    """LangGraph workflow state across gather -> plan -> patch -> verify -> approval pause."""

    codebase_dir: str
    blueprint_id: str
    blueprint_name: str
    ruleset: Dict[str, Any]
    custom_ruleset: Optional[Dict[str, Any]]
    include_external: bool
    baseline_audit: Dict[str, Any]
    target_violations: List[Dict[str, Any]]
    skipped_violations: List[Dict[str, str]]
    target_ids: List[str]
    source_paths: List[str]
    project_prefix: str
    blueprint_context: str
    sources_text: str
    compact_sources_text: str
    plan: Optional[Dict[str, Any]]
    patches: List[Dict[str, Any]]
    verification: Optional[Dict[str, Any]]
    feedback: str
    attempt: int
    max_attempts: int
    started_at: float
    time_budget_s: float
    best_patches: List[Dict[str, Any]]
    best_verification: Optional[Dict[str, Any]]
    previews: List[Dict[str, Any]]
    status: str
    summary: str
    decision: Optional[str]


def _format_blueprint_context(ruleset: Dict[str, Any], violations: List[Dict[str, Any]]) -> str:
    lines: List[str] = ["### Layers & Responsibilities"]
    for layer in ruleset.get("layers", []):
        desc = layer.get("description") or ""
        lines.append(f"- {layer['name']}: {desc}")
    lines.append("\n### Allowed Layer Dependencies")
    for rule in ruleset.get("rules", []):
        if rule.get("type") == "allow":
            reqs = ", ".join(rule.get("traced_requirements") or [])
            suffix = f" [reqs: {reqs}]" if reqs else ""
            lines.append(f"- {rule['source_layer']} -> {rule['target_layer']}: {rule.get('reason', '')}{suffix}")
    arcgen_notes: List[str] = []
    for v in violations:
        trace = v.get("trace") or {}
        for tr in trace.get("rules", []):
            edges = tr.get("arcgenEdges") or []
            just = tr.get("justification") or ""
            if edges or just:
                arcgen_notes.append(f"- {tr.get('source')} -> {tr.get('target')} ({', '.join(edges)}): {just}")
    if arcgen_notes:
        lines.append("\n### ArcGen Traceability Justifications")
        lines.extend(dict.fromkeys(arcgen_notes))
    return "\n".join(lines)


def _collect_source_paths(codebase: Path, violations: List[Dict[str, Any]]) -> List[str]:
    rel_files: List[str] = []
    source_dirs: set[str] = set()
    for v in violations:
        src_rel = v.get("source_file") or module_to_relpath(codebase, v["source_module"])
        tgt_rel = module_to_relpath(codebase, v["target_module"])
        if src_rel and "/" in src_rel:
            source_dirs.add(src_rel.rsplit("/", 1)[0])
        for rel in (src_rel, tgt_rel):
            if rel and (codebase / rel).exists() and rel not in rel_files:
                rel_files.append(rel)

    # Include existing ports files and sibling callers importing ports so incremental heals extend rather than clobber them.
    extra_ports: List[str] = []
    sibling_port_users: List[str] = []
    for path in _iter_repo_py_files(codebase):
        rel = path.relative_to(codebase).as_posix()
        if rel in rel_files:
            continue
        if path.name == "ports.py" or path.name.endswith("_ports.py"):
            if len(extra_ports) < 4:
                extra_ports.append(rel)
            continue
        parent = rel.rsplit("/", 1)[0] if "/" in rel else ""
        if parent in source_dirs and len(sibling_port_users) < 4:
            txt = path.read_text(encoding="utf-8", errors="ignore")[:4000]
            if ".ports import" in txt or "ports import" in txt:
                sibling_port_users.append(rel)
    rel_files.extend(extra_ports)
    rel_files.extend(sibling_port_users)

    if (codebase / "main.py").exists() and "main.py" not in rel_files:
        rel_files.append("main.py")
    return rel_files


def _detect_project_prefix(rel_files: List[str], violations: List[Dict[str, Any]]) -> str:
    """Return shared top folder prefix (e.g. 'Atempt2/') when all violating modules sit inside it."""
    roots = set()
    for v in violations:
        sf = (v.get("source_file") or "").replace("\\", "/").lstrip("/")
        if "/" in sf:
            roots.add(sf.split("/", 1)[0])
        elif sf:
            return ""
    if len(roots) == 1:
        top = next(iter(roots))
        if top not in {"domain", "application", "presentation", "infrastructure", "observability", "src", "app"}:
            if all(p.startswith(f"{top}/") for p in rel_files if p != "main.py"):
                return f"{top}/"
    return ""


def _format_gathered_sources(codebase: Path, rel_files: List[str]) -> str:
    return "\n\n".join(
        f"### {rel}\n```python\n{read_numbered_source(codebase, rel)}\n```"
        for rel in rel_files
    )


def _trim_at_line_boundary(text: str, budget: int) -> str:
    if len(text) <= budget:
        return text
    suffix = "\n# ... truncated ..."
    limit = max(60, budget - len(suffix))
    cut = text.rfind("\n", 0, limit)
    if cut <= 0:
        cut = limit
    return text[:cut] + suffix


def _render_primary_compact(lines: List[str], focus_lines: List[int], budget: int) -> str:
    """Keep top imports plus exact line-numbered windows around every violating line."""
    full = "\n".join(f"{i + 1:4d}| {line}" for i, line in enumerate(lines))
    if len(full) <= budget:
        return full

    def _window_text(header_end: int, radius: int) -> str:
        intervals: List[tuple[int, int]] = [(1, min(len(lines), header_end))]
        for ln in sorted({n for n in focus_lines if 1 <= n <= len(lines)}):
            intervals.append((max(1, ln - radius), min(len(lines), ln + radius)))
        merged: List[tuple[int, int]] = []
        for s, e in sorted(intervals):
            if merged and s <= merged[-1][1] + 2:
                merged[-1] = (merged[-1][0], max(merged[-1][1], e))
            else:
                merged.append((s, e))
        parts: List[str] = []
        prev_e = 0
        for s, e in merged:
            if prev_e and s > prev_e + 1:
                parts.append(f"# ... lines {prev_e + 1}-{s - 1} omitted ...")
            for idx in range(s - 1, e):
                parts.append(f"{idx + 1:4d}| {lines[idx]}")
            prev_e = e
        if prev_e < len(lines):
            parts.append(f"# ... lines {prev_e + 1}-{len(lines)} omitted ...")
        return "\n".join(parts)

    for header_end, radius in ((35, 18), (25, 10), (18, 5)):
        rendered = _window_text(header_end, radius)
        if len(rendered) <= budget:
            return rendered
    return _trim_at_line_boundary(_window_text(18, 5), budget)


def _render_secondary_skeleton(text: str, budget: int) -> str:
    """Keep full small context files or AST class/def signatures with real line numbers."""
    lines = text.splitlines()
    full = "\n".join(f"{i + 1:4d}| {line}" for i, line in enumerate(lines))
    if len(full) <= budget:
        return full

    keep: set[int] = set()
    try:
        tree = ast.parse(text)
        imports = 0
        for node in tree.body:
            if isinstance(node, (ast.Import, ast.ImportFrom)) and imports < 15:
                for ln in range(node.lineno, (node.end_lineno or node.lineno) + 1):
                    keep.add(ln)
                imports += 1
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                keep.add(node.lineno)
                if (
                    node.body
                    and isinstance(node.body[0], ast.Expr)
                    and isinstance(getattr(node.body[0], "value", None), ast.Constant)
                    and isinstance(node.body[0].value.value, str)
                ):
                    keep.add(node.body[0].lineno)
                if isinstance(node, ast.ClassDef):
                    for sub in node.body:
                        if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            keep.add(sub.lineno)
    except SyntaxError:
        for i, line in enumerate(lines):
            stripped = line.lstrip()
            if i < 20 or stripped.startswith(("import ", "from ", "class ", "def ", "async def ")):
                keep.add(i + 1)

    if not keep:
        keep.update(range(1, min(len(lines), 25) + 1))

    parts: List[str] = []
    prev_ln = 0
    for ln in sorted(n for n in keep if 1 <= n <= len(lines)):
        if prev_ln and ln > prev_ln + 1:
            parts.append(f"# ... lines {prev_ln + 1}-{ln - 1} omitted ...")
        parts.append(f"{ln:4d}| {lines[ln - 1]}")
        prev_ln = ln
    if prev_ln < len(lines):
        parts.append(f"# ... lines {prev_ln + 1}-{len(lines)} omitted ...")
    return _trim_at_line_boundary("\n".join(parts), budget)


def _format_compact_sources(
    codebase: Path,
    rel_files: List[str],
    violations: List[Dict[str, Any]],
    max_chars: int = 11000,
) -> str:
    """Format violation-focused code context capped to fit low-TPM providers cleanly."""
    focus_by_file: Dict[str, List[int]] = {}
    for v in violations:
        src_rel = v.get("source_file") or module_to_relpath(codebase, v["source_module"])
        if not src_rel:
            continue
        ln = v.get("line_number")
        bucket = focus_by_file.setdefault(src_rel, [])
        if isinstance(ln, int) and ln > 0:
            bucket.append(ln)

    primary = [r for r in rel_files if r in focus_by_file]
    secondary = [r for r in rel_files if r not in focus_by_file]
    p_total = int(max_chars * 0.75) if (primary and secondary) else max_chars
    s_total = max_chars - p_total if (primary and secondary) else max_chars

    sections: List[str] = []

    def _emit_group(files: List[str], group_budget: int, is_primary: bool) -> None:
        rem_budget = group_budget
        for idx, rel in enumerate(files):
            rem_files = len(files) - idx
            per_file_cap = max(250, rem_budget // rem_files)
            try:
                raw = resolve_safe_subpath(codebase, rel).read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            wrapper_len = len(rel) + 22
            body_budget = max(160, per_file_cap - wrapper_len)
            if is_primary:
                body = _render_primary_compact(raw.splitlines(), focus_by_file.get(rel, []), body_budget)
            else:
                body = _render_secondary_skeleton(raw, body_budget)
            block = f"### {rel}\n```python\n{body}\n```"
            sections.append(block)
            rem_budget = max(0, rem_budget - len(block) - 2)

    _emit_group(primary, p_total, True)
    _emit_group(secondary, s_total, False)
    joined = "\n\n".join(sections)
    if len(joined) > max_chars:
        joined = _trim_at_line_boundary(joined, max_chars)
    return joined


def _gather_sources(codebase: Path, violations: List[Dict[str, Any]]) -> str:
    return _format_gathered_sources(codebase, _collect_source_paths(codebase, violations))


def _format_feedback(v: VerificationResult) -> str:
    parts: List[str] = []
    if v.syntax_errors:
        parts.append("Syntax errors:\n- " + "\n- ".join(v.syntax_errors))
    if v.guardrail_rejections:
        parts.append("Guardrail rejections:\n- " + "\n- ".join(v.guardrail_rejections))
    if v.new_violation_ids:
        parts.append(
            "New architectural violations introduced:\n- "
            + "\n- ".join(v.new_violation_ids)
            + "\nFix: NEVER import any adapter or outer-layer module inside the violating inner-layer file "
            "(not at top level, not inside def main(), and not lazily inside any function). "
            "In that file, import ONLY the abstract Protocol/ABC port and accept it via parameter or constructor injection; "
            "keep concrete adapter wiring strictly in an outer composition entrypoint (e.g. a thin main.py) or omit it from the inner module."
        )
    if not v.tests_passed and v.test_output:
        parts.append(f"Tests / import smoke check failed:\n{v.test_output}")
    if v.passed is False and not (v.syntax_errors or v.guardrail_rejections or v.new_violation_ids):
        parts.append(
            f"Target violation(s) still present after patch. Health {v.health_before}->{v.health_after}, "
            f"violations {v.violations_before}->{v.violations_after}."
        )
    return "\n\n".join(parts)


def _review_summary(v: VerificationResult, patches: List[FilePatch]) -> str:
    tests_label = {True: "passed", False: "failed", None: "not run"}[v.tests_passed]
    lines = [
        f"Health {v.health_before}% -> {v.health_after}% | Violations {v.violations_before} -> {v.violations_after} | Tests: {tests_label}",
    ]
    if v.resolved_violation_ids:
        lines.append(f"Resolved: {', '.join(v.resolved_violation_ids)}")
    if patches:
        lines.append("Files: " + ", ".join(f"{p.path} ({p.operation})" for p in patches))
    return "\n".join(lines)


def build_healing_graph(
    plan_fn: Optional[Callable[[Dict[str, Any]], HealingPlan]] = None,
    patch_fn: Optional[Callable[[Dict[str, Any]], PatchSet]] = None,
    provider: Optional[str] = None,
    model_override: Optional[str] = None,
    emit_fn: Optional[Callable[[str, str, Optional[Dict[str, Any]]], None]] = None,
):
    """Build compiled LangGraph workflow with MemorySaver interrupt before `finalize`."""
    from langgraph.checkpoint.memory import MemorySaver
    from langgraph.graph import END, START, StateGraph

    llm_cache: Dict[str, Any] = {"idx": 0}

    def emit(kind: str, msg: str, data: Optional[Dict[str, Any]] = None) -> None:
        if emit_fn:
            emit_fn(kind, msg, data)

    def _get_candidates() -> List[tuple[str, Any]]:
        if "candidates" not in llm_cache:
            llm_cache["candidates"] = resolve_candidate_models(provider, model_override=model_override)
        return llm_cache["candidates"]

    def _invoke_with_fallback(
        stage: str,
        agent_name: str,
        sys_prompt: str,
        usr_prompt: str,
        schema: type,
        attempt: int = 1,
        compact_usr_prompt: Optional[str] = None,
    ):
        candidates = _get_candidates()
        start_idx = int(llm_cache.get("idx") or 0)
        errors: List[str] = []
        for idx in range(start_idx, len(candidates)):
            pname, model = candidates[idx]
            prefer_json = _prefer_direct_json(pname, model)
            use_compact = bool(
                compact_usr_prompt
                and pname.startswith("groq:")
                and (len(sys_prompt) + len(usr_prompt)) > 15000
                and len(compact_usr_prompt) < len(usr_prompt)
            )
            prompt_attempts = [compact_usr_prompt] if use_compact else [usr_prompt]
            if not use_compact and compact_usr_prompt and len(compact_usr_prompt) < len(usr_prompt):
                prompt_attempts.append(compact_usr_prompt)

            for p_idx, active_prompt in enumerate(prompt_attempts):
                t0 = time.monotonic()
                emit(
                    "trace",
                    f"Calling {pname} ({schema.__name__}, {'json' if prefer_json else 'structured'})",
                    {
                        "_agent": agent_name,
                        "_kind": "model_start",
                        "provider": pname,
                        "schema": schema.__name__,
                        "mode": "json" if prefer_json else "structured",
                        "attempt": attempt,
                        "prompt_chars": len(sys_prompt) + len(active_prompt),
                        "compact": active_prompt is compact_usr_prompt,
                    },
                )
                try:
                    out, meta = _invoke_structured_traced(model, sys_prompt, active_prompt, schema, prefer_json=prefer_json)
                    dt = round(time.monotonic() - t0, 2)
                    llm_cache["idx"] = idx
                    llm_cache["provider"] = pname
                    routed = meta.get("routed_model")
                    detail = f" · routed: {routed}" if routed else ""
                    emit(
                        "trace",
                        f"Model response in {dt:.1f}s ({meta.get('mode')}{detail})",
                        {
                            "_agent": agent_name,
                            "_kind": "model_end",
                            "provider": pname,
                            "routed_model": routed,
                            "mode": meta.get("mode"),
                            "duration_s": dt,
                            "tokens": meta.get("tokens"),
                        },
                    )
                    return out
                except Exception as exc:
                    dt = round(time.monotonic() - t0, 2)
                    err_txt = f"{type(exc).__name__}: {exc}"
                    if _is_request_too_large(exc) and p_idx + 1 < len(prompt_attempts):
                        emit(
                            stage,
                            f"Payload too large for '{pname}' ({len(active_prompt)} chars); retrying with focused source slices...",
                            {"_agent": agent_name, "_kind": "retry", "provider": pname},
                        )
                        continue
                    errors.append(f"{pname}: {err_txt}")
                    is_prov_fail = _is_provider_failure(exc)
                    emit(
                        "trace",
                        f"{pname} failed after {dt:.1f}s: {err_txt[:160]}",
                        {
                            "_agent": agent_name,
                            "_kind": "error" if not is_prov_fail else "retry",
                            "provider": pname,
                            "duration_s": dt,
                            "error": err_txt[:400],
                        },
                    )
                    if idx + 1 < len(candidates) and is_prov_fail:
                        next_name = candidates[idx + 1][0]
                        emit(
                            stage,
                            f"Provider '{pname}' failed ({type(exc).__name__}); falling back to '{next_name}'...",
                            {"_agent": agent_name, "_kind": "retry", "from": pname, "to": next_name},
                        )
                        break
                    if not is_prov_fail:
                        raise
                    break
        raise RuntimeError(f"All healing LLM providers failed ({'; '.join(errors)})")

    def gather_node(state: HealGraphState) -> Dict[str, Any]:
        codebase = Path(state["codebase_dir"])
        violations = state["target_violations"]
        emit("gather", f"Gathering source files for {len(violations)} violation(s)...", {"_agent": "ContextGatherer", "_kind": "agent_start"})
        source_paths = _collect_source_paths(codebase, violations)
        project_prefix = _detect_project_prefix(source_paths, violations)
        sources_text = _format_gathered_sources(codebase, source_paths)
        compact_sources_text = _format_compact_sources(codebase, source_paths, violations, max_chars=11000)
        bp_ctx = _format_blueprint_context(state["ruleset"], violations)
        target_ids = [violation_id_of(v) for v in violations]
        emit(
            "gather",
            f"Gathered context for {len(target_ids)} violation(s)",
            {
                "_agent": "ContextGatherer",
                "_kind": "agent_end",
                "targets": target_ids,
                "source_paths": source_paths,
                "prompt_chars": len(sources_text),
            },
        )
        return {
            "sources_text": sources_text,
            "compact_sources_text": compact_sources_text,
            "source_paths": source_paths,
            "project_prefix": project_prefix,
            "blueprint_context": bp_ctx,
            "target_ids": target_ids,
        }

    def plan_node(state: HealGraphState) -> Dict[str, Any]:
        emit("plan", "Designing Dependency Inversion plan...", {"_agent": "DIPPlanner", "_kind": "agent_start"})
        if plan_fn is not None:
            plan = plan_fn(state)
        else:
            targets_main = any((v.get("source_file") or "").endswith("main.py") for v in state["target_violations"])
            extra_rule = "" if targets_main else " or creating ports for composition-root wiring in main.py"
            prefix = state.get("project_prefix") or ""
            port_example = f"{prefix}domain/ports.py or {prefix}application/ports.py"
            sys_prompt = (
                "You are a senior software architect resolving architectural import violations cleanly using Dependency Inversion (DIP).\n"
                f"Design minimal Typing/ABC ports in inner layers (e.g. {port_example}) and dependency injection via __init__ or function parameters.\n"
                "The violating inner-layer module must import ONLY the abstract port, NEVER the new concrete adapter (even inside def main() or helper functions).\n"
                "Always preserve full relative file paths from the repository root (including any parent folders).\n"
                f"NEVER propose deleting functionality, editing tests/JSON files{extra_rule}."
            )
            viol_brief = json.dumps(
                [
                    {
                        "id": violation_id_of(v),
                        "source": f"{v['source_module']} ({v['source_layer']})",
                        "target": f"{v['target_module']} ({v['target_layer']})",
                        "file": v.get("source_file"),
                        "line": v.get("line_number"),
                        "snippet": v.get("code_snippet"),
                        "reason": v.get("reason"),
                    }
                    for v in state["target_violations"]
                ],
                indent=1,
            )
            usr_prompt = (
                f"Blueprint: {state['blueprint_name']}\n\n{state['blueprint_context']}\n\n"
                f"Violations to heal:\n{viol_brief}\n\nSource files:\n{state['sources_text']}"
            )
            compact_viol = json.dumps(
                [
                    {
                        "id": violation_id_of(v),
                        "source": f"{v['source_module']} ({v['source_layer']})",
                        "target": f"{v['target_module']} ({v['target_layer']})",
                        "file": v.get("source_file"),
                        "line": v.get("line_number"),
                        "snippet": v.get("code_snippet"),
                    }
                    for v in state["target_violations"]
                ],
                separators=(",", ":"),
            )
            compact_sources = state.get("compact_sources_text") or state["sources_text"]
            compact_usr_prompt = (
                f"Blueprint: {state['blueprint_name']}\n\n{state['blueprint_context'][:2000]}\n\n"
                f"Violations to heal:\n{compact_viol}\n\nSource files:\n{compact_sources}"
            )
            plan = _invoke_with_fallback(
                "plan", "DIPPlanner", sys_prompt, usr_prompt, HealingPlan, compact_usr_prompt=compact_usr_prompt
            )
        emit(
            "plan",
            f"Designed {len(plan.ports)} DIP port(s)",
            {"_agent": "DIPPlanner", "_kind": "agent_end", "ports": [p.model_dump() for p in plan.ports], "notes": plan.notes},
        )
        return {"plan": plan.model_dump()}

    def patch_node(state: HealGraphState) -> Dict[str, Any]:
        attempt = int(state.get("attempt") or 0) + 1
        emit(
            "patch",
            f"Generating patches (attempt {attempt}/{state['max_attempts']})...",
            {"_agent": "PatchWriter", "_kind": "agent_start", "attempt": attempt, "max_attempts": state["max_attempts"]},
        )
        if patch_fn is not None:
            patch_set = patch_fn({**state, "attempt": attempt})
        else:
            prefix = state.get("project_prefix") or ""
            source_paths = state.get("source_paths") or []
            prefix_rule = (
                f" Target files live under '{prefix}'; keep the '{prefix}' prefix on both modified and newly created paths (e.g. '{prefix}domain/ports.py')."
                if prefix else ""
            )
            main_hint = f"'{prefix}main.py'" if prefix else "'main.py'"
            sys_prompt = (
                "You are a surgical Python refactoring engineer.\n"
                "Rules:\n"
                f"1. Output ONLY relative POSIX paths (no '..' or leading '/') copying exact repository-relative paths verbatim (including parent subdirectories). Only edit or create .py files.{prefix_rule}\n"
                "2. NEVER delete functionality, tests, or imports without introducing a Protocol/ABC port and dependency injection.\n"
                "3. Preserve every public class and top-level function signature cleanly so callers keep working.\n"
                "4. For operation='modify', keep each edits[i].search small (only the lines around the change), copying verbatim text WITHOUT line numbers ('  1| '), "
                "appearing ONLY ONCE. Emit AT MOST ONE consolidated edit per contiguous changed region so edits never overlap or re-match earlier edits.\n"
                "5. Keep existing callers and composition root working cleanly so all imports and runtime tests succeed.\n"
                "6. If a ports.py file already exists or sibling modules already import symbols from `.ports` / `domain.ports`, use operation='modify' to preserve all existing port classes/methods.\n"
                "7. CRITICAL — NEVER import any concrete adapter class or outer-layer module inside the violating inner-layer file (not at top level, not inside def main(), and not lazily inside any function). "
                "Inside the violating inner-layer file, import ONLY the abstract Protocol/ABC port and accept it via an optional/injected parameter (raising RuntimeError if None when no caller injects it), "
                f"putting concrete adapter instantiation ONLY in an outer caller or thin {main_hint} composition script (<= 35 lines, no def/class definitions)."
            )
            paths_block = (
                "Exact existing file paths (use verbatim for operation='modify'):\n"
                + "\n".join(f"- {p}" for p in source_paths)
                + "\n\n"
                if source_paths else ""
            )
            feedback_block = f"\n\nPREVIOUS ATTEMPT FEEDBACK (fix every issue):\n{state['feedback']}" if state.get("feedback") else ""
            usr_prompt = (
                f"Healing Plan:\n{json.dumps(state.get('plan') or {}, indent=1)}\n\n"
                f"{paths_block}"
                f"Blueprint rules:\n{state['blueprint_context']}{feedback_block}\n\n"
                f"Current source files:\n{state['sources_text']}"
            )
            compact_feedback = f"\n\nPREVIOUS ATTEMPT FEEDBACK (fix every issue):\n{state['feedback'][:1500]}" if state.get("feedback") else ""
            compact_sources = state.get("compact_sources_text") or state["sources_text"]
            compact_usr_prompt = (
                f"Healing Plan:\n{json.dumps(state.get('plan') or {}, separators=(',', ':'))}\n\n"
                f"{paths_block}"
                f"Blueprint rules:\n{state['blueprint_context'][:1600]}{compact_feedback}\n\n"
                f"Current source files:\n{compact_sources}"
            )
            patch_set = _invoke_with_fallback(
                "patch", "PatchWriter", sys_prompt, usr_prompt, PatchSet, attempt=attempt, compact_usr_prompt=compact_usr_prompt
            )

        raw_patches = [p.model_dump() for p in patch_set.patches]
        emit(
            "patch",
            f"Produced {len(raw_patches)} file patch(es)",
            {
                "_agent": "PatchWriter",
                "_kind": "agent_end",
                "files": [p["path"] for p in raw_patches],
                "patches": [
                    {
                        "path": p["path"],
                        "operation": p.get("operation"),
                        "edits_count": len(p.get("edits") or []),
                        "rationale": p.get("rationale"),
                    }
                    for p in raw_patches
                ],
            },
        )
        return {"attempt": attempt, "patches": raw_patches}

    def verify_node(state: HealGraphState) -> Dict[str, Any]:
        patches = [FilePatch.model_validate(p) for p in (state.get("patches") or [])]
        codebase = Path(state["codebase_dir"])
        emit(
            "trace",
            f"Applying {len(patches)} patch(es) in isolated sandbox & running guardrails, audit, and tests...",
            {"_agent": "SandboxVerifier", "_kind": "tool_start", "files": [p.path for p in patches]},
        )
        t0 = time.monotonic()
        if not patches:
            ver = VerificationResult(
                passed=False,
                health_before=float(state["baseline_audit"]["metrics"]["healthScore"]),
                health_after=float(state["baseline_audit"]["metrics"]["healthScore"]),
                violations_before=len(state["baseline_audit"].get("violations") or []),
                violations_after=len(state["baseline_audit"].get("violations") or []),
                guardrail_rejections=["No patches were generated by the model."],
            )
        else:
            ver = verify_in_sandbox(
                codebase_dir=codebase,
                blueprint_id=state["blueprint_id"],
                patches=patches,
                baseline_audit=state["baseline_audit"],
                custom_ruleset=state.get("custom_ruleset"),
                include_external=state.get("include_external", True),
                target_violation_ids=state.get("target_ids"),
            )
        dt = round(time.monotonic() - t0, 2)

        best_patches = list(state.get("best_patches") or [])
        best_ver = state.get("best_verification")
        clean_ok = not ver.syntax_errors and not ver.guardrail_rejections and not ver.new_violation_ids
        if clean_ok and ver.resolved_violation_ids:
            if best_ver is None or (ver.violations_after, -ver.health_after) < (best_ver["violations_after"], -best_ver["health_after"]):
                best_patches = [p.model_dump() for p in patches]
                best_ver = ver.model_dump()

        if ver.guardrail_rejections or ver.syntax_errors or ver.new_violation_ids:
            issues = ver.syntax_errors + ver.guardrail_rejections + [f"New violation: {nid}" for nid in ver.new_violation_ids]
            emit(
                "trace",
                issues[0],
                {
                    "_agent": "SandboxVerifier",
                    "_kind": "guardrail_block",
                    "guardrail_rejections": ver.guardrail_rejections,
                    "syntax_errors": ver.syntax_errors,
                    "new_violation_ids": ver.new_violation_ids,
                },
            )

        emit(
            "verify",
            f"Sandbox verify ({dt:.1f}s): {'PASSED' if ver.passed else 'FAILED'} (Health {ver.health_before}% -> {ver.health_after}%)",
            {"_agent": "SandboxVerifier", "_kind": "verification", "duration_s": dt, **ver.model_dump()},
        )
        return {
            "verification": ver.model_dump(),
            "feedback": _format_feedback(ver),
            "best_patches": best_patches,
            "best_verification": best_ver,
        }

    def route_after_verify(state: HealGraphState) -> str:
        ver = state["verification"]
        if ver["passed"]:
            return "await_approval"
        elapsed = time.monotonic() - float(state.get("started_at") or time.monotonic())
        if int(state["attempt"]) < int(state["max_attempts"]) and elapsed < float(state.get("time_budget_s") or DEFAULT_TIME_BUDGET_S):
            emit(
                "retry",
                f"Retrying patch generation with sandbox feedback (attempt {state['attempt']} -> {state['attempt'] + 1})",
                {"_agent": "SandboxVerifier", "_kind": "retry", "feedback": state.get("feedback")},
            )
            return "write_patches"
        return "await_approval"

    def await_approval_node(state: HealGraphState) -> Dict[str, Any]:
        ver = VerificationResult.model_validate(state["verification"])
        codebase = Path(state["codebase_dir"])
        chosen_patches = [FilePatch.model_validate(p) for p in (state.get("patches") or [])]
        status = "healed" if ver.passed else "failed"

        if not ver.passed and state.get("best_verification"):
            ver = VerificationResult.model_validate(state["best_verification"])
            chosen_patches = [FilePatch.model_validate(p) for p in (state.get("best_patches") or [])]
            status = "partial"

        previews: List[FileDiffPreview] = []
        if status in ("healed", "partial") and chosen_patches:
            # Verify final preview generation cleanly without touching disk.
            previews = build_diff_previews(codebase, chosen_patches)
            if not previews:
                status = "failed"

        summary = _review_summary(ver, chosen_patches)
        emit(
            "awaiting_approval" if previews else "verified_failed",
            "Verified patches ready for diff review" if previews else "Healing failed verification checks",
            {
                "_agent": "SandboxVerifier",
                "_kind": "task_end" if previews else "error",
                "status": status,
                "previews": [p.model_dump() for p in previews],
                "summary": summary,
            },
        )
        return {
            "status": status,
            "patches": [p.model_dump() for p in chosen_patches],
            "verification": ver.model_dump(),
            "previews": [p.model_dump() for p in previews],
            "summary": summary,
        }

    def finalize_node(state: HealGraphState) -> Dict[str, Any]:
        decision = state.get("decision") or "rejected"
        emit("decision", f"User decision recorded: {decision}", {"_agent": "SandboxVerifier", "_kind": "task_end", "decision": decision})
        return {"decision": decision}

    builder = StateGraph(HealGraphState)
    builder.add_node("gather_sources", gather_node)
    builder.add_node("plan_fixes", plan_node)
    builder.add_node("write_patches", patch_node)
    builder.add_node("verify_sandbox", verify_node)
    builder.add_node("await_approval", await_approval_node)
    builder.add_node("finalize", finalize_node)

    builder.add_edge(START, "gather_sources")
    builder.add_edge("gather_sources", "plan_fixes")
    builder.add_edge("plan_fixes", "write_patches")
    builder.add_edge("write_patches", "verify_sandbox")
    builder.add_conditional_edges(
        "verify_sandbox",
        route_after_verify,
        {"write_patches": "write_patches", "await_approval": "await_approval"},
    )
    builder.add_edge("await_approval", "finalize")
    builder.add_edge("finalize", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer, interrupt_before=["finalize"])
