import os
import json
import httpx
from typing import List, Dict, Any, Optional

OMNIKEY_BASE_URL = os.getenv(
    "OMNIKEY_BASE_URL",
    "https://omnikey-ai-unified-key-manager.onrender.com/v1beta"
)
OMNIKEY_API_KEY = os.getenv(
    "OMNIKEY_API_KEY",
    "omnikey-g-3b917034df4b4d587d751288802bf6c3b223d53976f0e21d"
)
OMNIKEY_MODEL = os.getenv(
    "OMNIKEY_MODEL",
    "gemini-2.5-flash"
)
OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://localhost:11434"
)

def extract_suggestions(raw_text: str, attached: set, file_symbol_map: dict) -> List[Dict[str, Any]]:
    """Extracts and validates suggested files against the strict 95/2 rule."""
    if not raw_text:
        return []
    raw_text = raw_text.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    elif raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
    raw_text = raw_text.strip()
    
    try:
        parsed = json.loads(raw_text)
        suggestions = parsed.get("suggested_files", []) if isinstance(parsed, dict) else []
        filtered = []
        for s in suggestions:
            if isinstance(s, dict):
                p = s.get("path", "")
                if p and p not in attached and p in file_symbol_map:
                    filtered.append(s)
                    if len(filtered) >= 2:
                        break
        return filtered
    except Exception:
        return []

async def suggest_context_files(
    user_prompt: str,
    knowledge_graph: Dict[str, Any],
    active_file_path: Optional[str] = None,
    attached_files: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Evaluates the developer's prompt against the Knowledge Graph symbol index
    and returns AT MOST 1 TO 2 files containing 95% of the core mutation context.
    Enforces the '95/2 Rule' with cloud OmniKey and automatic local Ollama fallback.
    """
    if not user_prompt or len(user_prompt.strip()) < 3:
        return []

    attached = set(attached_files or [])
    if active_file_path:
        attached.add(active_file_path)

    # 1. Build a condensed file-to-symbols index from the Knowledge Graph
    nodes = knowledge_graph.get("nodes", [])
    file_symbol_map: Dict[str, List[str]] = {}

    for n in nodes:
        fpath = n.get("file_path", "")
        if not fpath:
            continue
        # Skip auxiliary/vendor files
        if any(ign in fpath for ign in ["node_modules", "venv", ".git", "__pycache__", "package-lock"]):
            continue
        
        if fpath not in file_symbol_map:
            file_symbol_map[fpath] = []
        
        kind = n.get("kind", "")
        label = n.get("label", "")
        if kind in ["endpoint", "function", "class"]:
            file_symbol_map[fpath].append(f"[{kind}] {label}")

    if not file_symbol_map:
        return []

    # Format the file map compactly (max 60 files)
    file_manifest_lines = []
    for fpath, syms in list(file_symbol_map.items())[:60]:
        syms_str = ", ".join(syms[:8])
        if len(syms) > 8:
            syms_str += f" (+{len(syms) - 8} more)"
        file_manifest_lines.append(f"- `{fpath}`: {syms_str if syms_str else 'General code/config'}")

    file_manifest_text = "\n".join(file_manifest_lines)

    system_instruction = """You are an elite Code Context Recommender applying the STRICT '95/2 Rule':
1. Given the developer's prompt and the codebase file manifest, identify the MINIMAL set of files needed to satisfy the request.
2. STRICT CAP: Suggest at most 1 to 2 files. NEVER suggest 3 or more files.
3. The 1-2 files must contain 95% of the core mutation context (where code will actually be edited or added).
4. Strictly EXCLUDE test files, utility files, build configs, and indirect dependencies.
5. If the user's prompt does not require any additional files, or if the active file already covers it, return an empty list.

Reply ONLY with valid JSON in this exact structure:
{
  "suggested_files": [
    {
      "path": "path/to/file.py",
      "reason": "Contains 95% of the mutation logic for X",
      "confidence": 0.95
    }
  ]
}"""

    user_message = f"""Developer Draft Prompt:
"{user_prompt}"

Active Open File:
`{active_file_path or 'None'}`

Already Attached Files:
{json.dumps(list(attached))}

Codebase File & Symbol Manifest:
{file_manifest_text}
"""

    # Primary Attempt: Cloud OmniKey Proxy (Gemini 2.5 Flash)
    url = f"{OMNIKEY_BASE_URL}/models/{OMNIKEY_MODEL}:generateContent?key={OMNIKEY_API_KEY}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_instruction}\n\n{user_message}"}]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    try:
        async with httpx.AsyncClient(timeout=16.0) as client:
            resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        raw_text = parts[0].get("text", "")
                        results = extract_suggestions(raw_text, attached, file_symbol_map)
                        if results:
                            return results
    except Exception as e:
        err_type = type(e).__name__
        err_detail = str(e) or "request timeout"
        print(f"OmniKey context recommender notice: {err_type} ({err_detail}). Engaging local fallback...")

    # Secondary Fallback: Local Ollama (gemma3:4b)
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            ollama_payload = {
                "model": "gemma3:4b",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_message}
                ],
                "format": "json",
                "stream": False
            }
            resp = await client.post(f"{OLLAMA_URL}/api/chat", json=ollama_payload)
            if resp.status_code == 200:
                d = resp.json()
                content = d.get("message", {}).get("content", "")
                results = extract_suggestions(content, attached, file_symbol_map)
                if results:
                    return results
    except Exception as e:
        print(f"Local Ollama context recommender fallback error: {e}")

    return []
