from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from pathlib import Path
import httpx
import json as json_module
import os
import asyncio
import logging

logger = logging.getLogger(__name__)

from .config import RAG_SERVICE_URL, INGESTION_SERVICE_URL, OLLAMA_URL, DEFAULT_MODEL, get_ollama_url
from .context_suggester import suggest_context_files
from .github_workspace import GitHubWorkspaceClient
from .flow_tracer import FlowTracer, is_flow_query

app = FastAPI(
    title="Archon Copilot Orchestrator Gateway",
    version="1.0.0",
    description="Smart multi-model routing, prompt synthesis, workspace explorer, and IDE Archon Copilot Agent"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from .conformance_router import router as conformance_router
app.include_router(conformance_router, prefix="/api/conformance", tags=["conformance"])

WORKSPACE_ROOT = Path(os.getenv("WORKSPACE_ROOT", "/workspace" if os.path.exists("/workspace") else str(Path(__file__).resolve().parent.parent.parent.parent)))

IGNORED_DIRS = {
    ".git", "venv", ".venv", "node_modules", ".next", "__pycache__", ".idea", ".vscode", "data", "chroma_db",
    "AppData", "Application Data", "Local Settings", "Cookies", "NetHood", "PrintHood", "Recent", "SendTo",
    "Start Menu", "Templates", ".cache", ".npm", ".config", "$RECYCLE.BIN", "System Volume Information",
    "MicrosoftEdgeBackups", "Searches", "Contacts", "Saved Games", "Links"
}

@app.on_event("startup")
def ensure_git_safe_directory():
    """Automatically ensures Git safe.directory '*' is configured for all repositories and mounts."""
    try:
        subprocess.run(["git", "config", "--global", "--add", "safe.directory", "*"], check=False)
    except Exception:
        pass

class QueryRequest(BaseModel):
    query: str
    model: str = DEFAULT_MODEL
    top_k: Optional[int] = 5
    search_strategy: Optional[str] = "hybrid" # "hybrid", "dense", "bm25"

class Message(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str

class ContextFile(BaseModel):
    path: str
    content: Optional[str] = None

class AgentChatRequest(BaseModel):
    messages: List[Message]
    active_file_path: Optional[str] = None
    active_file_content: Optional[str] = None
    context_files: Optional[List[ContextFile]] = None
    model: str = DEFAULT_MODEL
    temperature: Optional[float] = 0.2

class SuggestFilesRequest(BaseModel):
    prompt: str
    active_file_path: Optional[str] = None
    attached_files: Optional[List[str]] = None

class GitHubOpenRequest(BaseModel):
    repo_url: str  # "owner/repo" or full https URL
    token: Optional[str] = None
    branch: Optional[str] = None

class GitHubSaveRequest(BaseModel):
    owner: str
    repo: str
    path: str
    content: str
    commit_message: Optional[str] = "Update via Archon Copilot"
    branch: str = "main"
    sha: Optional[str] = None
    token: Optional[str] = None

class GitHubForkRequest(BaseModel):
    owner: str
    repo: str
    token: str

class IndexCodebaseRequest(BaseModel):
    workspace_path: Optional[str] = None
    is_github: Optional[bool] = False
    github_owner: Optional[str] = None
    github_repo: Optional[str] = None
    github_branch: Optional[str] = "main"
    github_token: Optional[str] = None

class FileContentRequest(BaseModel):
    path: str
    content: Optional[str] = None

class CreateFileRequest(BaseModel):
    path: str
    is_directory: bool = False

@app.get("/health")
async def health():
    """Checks health across all connected microservices."""
    async with httpx.AsyncClient(timeout=3.0) as client:
        rag_healthy = False
        ingestion_healthy = False
        ollama_healthy = False

        try:
            r = await client.get(f"{RAG_SERVICE_URL}/health")
            rag_healthy = r.status_code == 200
        except Exception:
            pass

        try:
            r = await client.get(f"{INGESTION_SERVICE_URL}/health")
            ingestion_healthy = r.status_code == 200
        except Exception:
            pass

        try:
            r = await client.get(f"{get_ollama_url()}/api/tags")
            ollama_healthy = r.status_code == 200
        except Exception:
            pass

    return {
        "status": "healthy" if rag_healthy and ingestion_healthy else "degraded",
        "services": {
            "orchestrator": True,
            "rag_service": rag_healthy,
            "ingestion_service": ingestion_healthy,
            "ollama_gpu": ollama_healthy
        }
    }


@app.get("/api/database")
async def get_database():
    """Proxies database chunks and collection info from RAG Service."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{RAG_SERVICE_URL}/api/database")
            return response.json()
        except Exception as e:
            return {"error": f"Failed to reach RAG service: {e}", "fixed_chunks": [], "semantic_chunks": []}

@app.post("/api/search")
async def search(req: QueryRequest):
    """Proxies hybrid search directly to RAG Service."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                f"{RAG_SERVICE_URL}/api/search",
                json={"query": req.query, "top_k": req.top_k or 5}
            )
            return response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Search service error: {e}")

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """Orchestrates upload: passes file to Ingestion Service, then forwards chunks to RAG Service."""
    file_bytes = await file.read()
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            parse_resp = await client.post(
                f"{INGESTION_SERVICE_URL}/api/parse-file",
                files={"file": (file.filename, file_bytes, file.content_type)}
            )
            if parse_resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Ingestion failed: {parse_resp.text}")
            parse_data = parse_resp.json()
            chunks = parse_data.get("chunks", [])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error communicating with Ingestion Service: {e}")

        if not chunks:
            return {"message": "No endpoints or sections found in file.", "chunks": []}

        try:
            ingest_resp = await client.post(
                f"{RAG_SERVICE_URL}/api/ingest",
                json={"chunks": chunks}
            )
            if ingest_resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"RAG indexing failed: {ingest_resp.text}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error communicating with RAG Service: {e}")

    return {
        "message": f"Successfully parsed and ingested {len(chunks)} API segments.",
        "chunks": [c["text"] for c in chunks]
    }

@app.post("/api/generate")
async def generate(req: QueryRequest):
    """Smart Orchestrator generation: retrieves re-ranked context, synthesizes prompt, and streams tokens."""
    context_text = ""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            search_resp = await client.post(
                f"{RAG_SERVICE_URL}/api/search",
                json={"query": req.query, "top_k": req.top_k or 5}
            )
            if search_resp.status_code == 200:
                search_data = search_resp.json()
                strat = (req.search_strategy or "hybrid").lower()
                if strat == "bm25":
                    results = search_data.get("bm25", [])
                elif strat == "dense":
                    results = search_data.get("dense", [])
                else:
                    results = search_data.get("cross_encoder", [])
                valid_chunks = [c["text"] for c in results if isinstance(c, dict) and "text" in c and c.get("score") != "N/A"]
                if valid_chunks:
                    context_text = "\n\n---\n\n".join(valid_chunks)
    except Exception as e:
        print(f"Warning: RAG context retrieval failed: {e}")

    prompt = f"""You are an Enterprise API Copilot, an expert AI assistant specializing in API integrations, endpoint specifications, and developer code synthesis.
Answer the developer's question accurately, completely, and concisely based on the provided API documentation context below.
Provide production-ready code examples (e.g. cURL, Python, TypeScript) with correct endpoints, parameters, and headers where applicable.

### API Documentation Context:
{context_text if context_text else 'No specific API documentation found.'}

### Developer Query:
{req.query}
"""

    async def token_stream():
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream(
                    "POST",
                    f"{get_ollama_url()}/api/generate",
                    json={"model": req.model, "prompt": prompt, "stream": True},
                    timeout=None
                ) as response:
                    async for line in response.aiter_lines():
                        if line.strip():
                            try:
                                chunk = json_module.loads(line)
                                token = chunk.get("response", "")
                                if token:
                                    yield f"data: {json_module.dumps({'token': token})}\n\n"
                                if chunk.get("done", False):
                                    yield f"data: {json_module.dumps({'done': True})}\n\n"
                                    break
                            except json_module.JSONDecodeError:
                                continue
            except Exception as e:
                err_msg = str(e) if str(e) else repr(e)
                yield f"data: {json_module.dumps({'error': f'Ollama Connection Error: {err_msg}'})}\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")

# ── Workspace File Explorer & IDE Endpoints ───────────────────────────────

ACTIVE_WORKSPACE_ROOT = WORKSPACE_ROOT


def _seed_demo_and_recent_projects() -> List[str]:
    """Ensure writable demo codebase exists inside gitignored test_codebases/ and pre-populate Recent Workspaces."""
    recent: List[str] = [str(WORKSPACE_ROOT).replace("\\", "/")]
    demo_dest = WORKSPACE_ROOT / "test_codebases" / "ecommerce_platform"

    if not demo_dest.exists():
        import shutil
        from conformance.studio.service import normalize_target_path

        try:
            demo_src = normalize_target_path("ecommerce_platform", WORKSPACE_ROOT)
            if demo_src.exists() and demo_src.is_dir() and demo_src.resolve() != demo_dest.resolve():
                demo_dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(
                    demo_src,
                    demo_dest,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git"),
                )
        except Exception:
            pass

    if demo_dest.exists() and demo_dest.is_dir():
        recent.append(str(demo_dest).replace("\\", "/"))

    imported_dir = WORKSPACE_ROOT / "test_codebases" / "imported"
    if imported_dir.exists() and imported_dir.is_dir():
        for entry in sorted(imported_dir.iterdir(), key=lambda p: p.name.lower()):
            if entry.is_dir() and not entry.name.startswith("."):
                recent.append(str(entry).replace("\\", "/"))

    return list(dict.fromkeys(recent))


RECENT_PROJECTS: List[str] = _seed_demo_and_recent_projects()

class OpenProjectRequest(BaseModel):
    path: str
    create_if_missing: Optional[bool] = False

class TerminalExecRequest(BaseModel):
    command: str
    cwd: Optional[str] = None
    terminal_id: Optional[str] = "term-1"

import subprocess

_HOST_MOUNT = Path("/mnt/c/Users")
_COMMON_HOST_SUBDIRS = ("Projects", "projects", "Desktop", "Documents", "repos", "code", "src", "dev", "workspace", "work")


def _resolve_host_linux_path(cleaned: str) -> Optional[Path]:
    if not _HOST_MOUNT.is_dir():
        return None
    env_home = (os.getenv("HOST_USERS_DIR") or "").strip().replace("\\", "/").rstrip("/")
    if env_home.startswith("/") and (cleaned == env_home or cleaned.startswith(env_home + "/")):
        rel = cleaned[len(env_home):].lstrip("/")
        return (_HOST_MOUNT / rel) if rel else _HOST_MOUNT
    if cleaned == "~" or cleaned.startswith("~/"):
        rel = cleaned[1:].lstrip("/")
        return (_HOST_MOUNT / rel) if rel else _HOST_MOUNT
    if cleaned.startswith("/home/") or cleaned.startswith("/Users/"):
        parts = cleaned.strip("/").split("/")
        if len(parts) >= 2:
            cand_home = _HOST_MOUNT / "/".join(parts[2:]) if len(parts) > 2 else _HOST_MOUNT
            cand_parent = _HOST_MOUNT / "/".join(parts[1:])
            for cand in (cand_home, cand_parent):
                if cand.exists():
                    return cand
            return cand_home
    return None


def _find_folder_by_name(name_clean: str) -> Optional[Path]:
    if not name_clean:
        return None
    candidates: List[Path] = [
        ACTIVE_WORKSPACE_ROOT / name_clean,
        WORKSPACE_ROOT / "test_codebases" / name_clean,
        WORKSPACE_ROOT / "targets" / name_clean,
        WORKSPACE_ROOT / name_clean,
        Path("/archon_repo") / name_clean,
    ]
    if _HOST_MOUNT.is_dir():
        candidates.append(_HOST_MOUNT / name_clean)
        for sub in _COMMON_HOST_SUBDIRS:
            candidates.append(_HOST_MOUNT / sub / name_clean)
    for c in candidates:
        if c.exists() and c.is_dir():
            return c.resolve()

    walk_roots = [WORKSPACE_ROOT]
    if _HOST_MOUNT.is_dir():
        walk_roots.append(_HOST_MOUNT)
    for base in walk_roots:
        base_str = str(base)
        for root, dirs, _ in os.walk(base_str):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in IGNORED_DIRS)
            depth = root[len(base_str):].count(os.sep)
            if depth > 2:
                dirs.clear()
                continue
            if name_clean in dirs:
                found_p = Path(root) / name_clean
                if found_p.is_dir():
                    return found_p.resolve()
    return None


def normalize_workspace_path(p_str: str) -> Path:
    cleaned = p_str.strip().replace("\\", "/")

    # 1. Clean malformed /mnt/D:... or /mnt/d:... prefixes
    if cleaned.lower().startswith("/mnt/") and len(cleaned) >= 7 and cleaned[6] == ":":
        drive = cleaned[5].lower()
        rest = cleaned[7:].lstrip("/")
        cleaned = f"{drive}:/{rest}"
    elif cleaned.lower().startswith("/mnt/") and len(cleaned) >= 6 and cleaned[5] == "/":
        drive = cleaned[4].lower()
        rest = cleaned[6:].lstrip("/")
        cleaned = f"/mnt/{drive}/{rest}"

    clean_lower = cleaned.lower().rstrip("/")

    # 2. Check if path starts with a Windows Drive (e.g. C:/... or D:/...)
    if len(cleaned) >= 2 and cleaned[1] == ":":
        drive = cleaned[0].lower()
        rest = cleaned[2:].lstrip("/")
        if os.name != 'nt':
            # If /mnt/c or /mnt/d is mounted
            if os.path.exists(f"/mnt/{drive}"):
                return Path(f"/mnt/{drive}/{rest}").resolve() if rest else Path(f"/mnt/{drive}").resolve()
            # If running in Docker where /workspace is the repo
            if os.path.exists("/workspace"):
                if not rest or rest.lower() == "aidev":
                    return Path("/workspace").resolve()
                return (Path("/workspace") / rest).resolve()
        return Path(cleaned).resolve()

    # 3. If running inside Docker where /workspace is mounted
    if os.path.exists("/workspace"):
        if clean_lower in ["", ".", "./", "/workspace", "d:/aidev", "/mnt/d/aidev", "aidev"]:
            return Path("/workspace").resolve()
        if clean_lower.startswith("/mnt/d/aidev/"):
            sub = cleaned[13:].lstrip("/")
            return (Path("/workspace") / sub).resolve()
        if clean_lower.startswith("d:/aidev/"):
            sub = cleaned[9:].lstrip("/")
            return (Path("/workspace") / sub).resolve()
        if clean_lower.startswith("/workspace/"):
            sub = cleaned[11:].lstrip("/")
            return (Path("/workspace") / sub).resolve()

    # 4. Handle Linux /mnt/... mounts
    if os.name != 'nt' and clean_lower.startswith("/mnt/"):
        if os.path.exists(cleaned):
            return Path(cleaned).resolve()
        if os.path.exists("/workspace") and "aidev" in clean_lower:
            idx = clean_lower.find("aidev")
            sub = cleaned[idx + 5:].lstrip("/")
            return (Path("/workspace") / sub).resolve() if sub else Path("/workspace").resolve()

    # 5. Handle Linux host home / ~ paths mapped into /mnt/c/Users
    if not Path(cleaned).exists():
        host_resolved = _resolve_host_linux_path(cleaned)
        if host_resolved is not None and host_resolved.exists():
            return host_resolved.resolve()

    p = Path(cleaned)
    if not p.is_absolute() and not cleaned.startswith("/"):
        cand = (ACTIVE_WORKSPACE_ROOT / cleaned).resolve()
        if cand.exists():
            return cand
        fallback_roots: list[Path] = [WORKSPACE_ROOT, Path("/archon_repo"), WORKSPACE_ROOT.parent]
        if _HOST_MOUNT.is_dir():
            fallback_roots.append(_HOST_MOUNT)
        for fallback_root in fallback_roots:
            if (fallback_root / cleaned).exists():
                return (fallback_root / cleaned).resolve()
        if "/" not in cleaned and cleaned not in (".", ".."):
            found = _find_folder_by_name(cleaned)
            if found is not None:
                return found
        return cand
    return p.resolve()

def get_active_git_branch(directory: Path) -> str:
    """Returns the live git branch of the directory or 'no git' if not a repo."""
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=str(directory),
            capture_output=True,
            text=True,
            timeout=2.0
        )
        if res.returncode == 0:
            branch = res.stdout.strip()
            if branch:
                return branch
    except Exception:
        pass
    return "main"

@app.get("/api/workspace/projects")
def get_workspace_projects():
    """Returns current active project, recent projects list, and live git branch."""
    global ACTIVE_WORKSPACE_ROOT, RECENT_PROJECTS
    return {
        "current_project": ACTIVE_WORKSPACE_ROOT.name,
        "project_path": str(ACTIVE_WORKSPACE_ROOT).replace("\\", "/"),
        "git_branch": get_active_git_branch(ACTIVE_WORKSPACE_ROOT),
        "recent_projects": list(dict.fromkeys(RECENT_PROJECTS))[:10]
    }

@app.post("/api/workspace/open-project")
def open_workspace_project(req: OpenProjectRequest):
    """Opens any folder / directory on the host as the active IDE project root, creating if requested."""
    global ACTIVE_WORKSPACE_ROOT, RECENT_PROJECTS

    # Check if target is a GitHub URL or slug (e.g. https://github.com/owner/repo)
    raw_p = req.path.strip()
    slug = None
    if "github.com/" in raw_p:
        parts = raw_p.split("github.com/")[-1].strip("/").split("/")
        if len(parts) >= 2:
            slug = f"{parts[0]}/{parts[1].replace('.git', '')}"
    elif raw_p.startswith("gh:"):
        slug = raw_p[3:].strip("/")

    if slug:
        from conformance.studio.github_import import import_github_repo
        cloned_dir = import_github_repo(slug, WORKSPACE_ROOT)
        ACTIVE_WORKSPACE_ROOT = cloned_dir
        normalized_path = str(cloned_dir).replace("\\", "/")
        if normalized_path not in RECENT_PROJECTS:
            RECENT_PROJECTS.insert(0, normalized_path)
        return {
            "status": "success",
            "current_project": slug,
            "project_path": normalized_path,
            "git_branch": get_active_git_branch(cloned_dir),
            "recent_projects": list(dict.fromkeys(RECENT_PROJECTS))[:10]
        }

    target_path = normalize_workspace_path(req.path)
    
    if not target_path.exists():
        if req.create_if_missing:
            target_path.mkdir(parents=True, exist_ok=True)
            readme_file = target_path / "README.md"
            if not readme_file.exists():
                readme_file.write_text(f"# {target_path.name}\n\nInitialized with Archon Copilot.\n", encoding="utf-8")
        else:
            raise HTTPException(status_code=400, detail=f"Directory not found: {req.path}")
    elif not target_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {req.path}")
    
    ACTIVE_WORKSPACE_ROOT = target_path
    normalized_path = str(target_path).replace("\\", "/")
    if normalized_path not in RECENT_PROJECTS:
        RECENT_PROJECTS.insert(0, normalized_path)

    try:
        subprocess.run(["git", "config", "--global", "--add", "safe.directory", "*"], check=False)
    except Exception:
        pass

    return {
        "status": "success",
        "current_project": target_path.name,
        "project_path": normalized_path,
        "git_branch": get_active_git_branch(target_path),
        "recent_projects": list(dict.fromkeys(RECENT_PROJECTS))[:10]
    }


@app.get("/api/workspace/resolve-folder")
def resolve_folder_path(name: str):
    """Given a folder name selected in OS Explorer, resolves its full path."""
    name_clean = name.strip().replace("\\", "/").rstrip("/").split("/")[-1]
    found = _find_folder_by_name(name_clean)
    if found is not None:
        return {"found": True, "path": str(found).replace("\\", "/")}
    return {"found": False, "path": name}


@app.get("/api/workspace/browse-directory")
def browse_directory(path: Optional[str] = None):
    """Lists subdirectories to allow visual folder selection."""
    target = normalize_workspace_path(path) if path else ACTIVE_WORKSPACE_ROOT
    if not target.exists() or not target.is_dir():
        target = WORKSPACE_ROOT
    
    subdirs = []
    try:
        for entry in os.scandir(str(target)):
            if entry.is_dir() and not entry.name.startswith("."):
                subdirs.append({
                    "name": entry.name,
                    "path": str(entry.path).replace("\\", "/")
                })
    except Exception:
        pass
    
    subdirs.sort(key=lambda x: x["name"].lower())
    parent_path = str(target.parent).replace("\\", "/") if target.parent != target else None
    return {
        "current_path": str(target).replace("\\", "/"),
        "parent_path": parent_path,
        "directories": subdirs
    }

@app.post("/api/terminal/exec")
async def terminal_exec(req: TerminalExecRequest):
    """Executes a real shell command in the active workspace directory context."""
    global ACTIVE_WORKSPACE_ROOT
    raw_cmd = req.command.strip()
    cwd_str = str(ACTIVE_WORKSPACE_ROOT).replace("\\", "/")
    
    if not raw_cmd:
        return {"stdout": "", "stderr": "", "exit_code": 0, "cwd": cwd_str}
    
    # Handle 'cd <dir>' command
    if raw_cmd == "cd" or raw_cmd.startswith("cd "):
        parts = raw_cmd.split(maxsplit=1)
        target_dir_str = parts[1].strip() if len(parts) > 1 else "~"
        if target_dir_str == "~":
            new_dir = Path.home()
        elif target_dir_str.startswith("/"):
            new_dir = Path(target_dir_str).resolve()
        elif len(target_dir_str) >= 2 and target_dir_str[1] == ":":
            new_dir = normalize_workspace_path(target_dir_str)
        else:
            new_dir = (ACTIVE_WORKSPACE_ROOT / target_dir_str).resolve()
        
        if new_dir.exists() and new_dir.is_dir():
            ACTIVE_WORKSPACE_ROOT = new_dir
            new_cwd = str(new_dir).replace("\\", "/")
            if new_cwd not in RECENT_PROJECTS:
                RECENT_PROJECTS.insert(0, new_cwd)
            return {
                "stdout": f"Changed working directory to {new_dir}\n",
                "stderr": "",
                "exit_code": 0,
                "cwd": new_cwd,
                "project_name": new_dir.name,
                "git_branch": get_active_git_branch(new_dir)
            }
        else:
            return {
                "stdout": "",
                "stderr": f"cd: no such file or directory: {target_dir_str}\n",
                "exit_code": 1,
                "cwd": cwd_str
            }
    
    # Execute command in shell
    try:
        shell_cmd = ["bash", "-c", raw_cmd] if os.name != "nt" else ["cmd.exe", "/c", raw_cmd]
        process = await asyncio.create_subprocess_exec(
            *shell_cmd,
            cwd=str(ACTIVE_WORKSPACE_ROOT),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=45.0)
            stdout_str = stdout_bytes.decode("utf-8", errors="replace")
            stderr_str = stderr_bytes.decode("utf-8", errors="replace")
            return {
                "stdout": stdout_str,
                "stderr": stderr_str,
                "exit_code": process.returncode if process.returncode is not None else 0,
                "cwd": str(ACTIVE_WORKSPACE_ROOT).replace("\\", "/")
            }
        except asyncio.TimeoutError:
            try:
                process.kill()
            except Exception:
                pass
            return {
                "stdout": "",
                "stderr": "Command execution timed out (45s limit)\n",
                "exit_code": 124,
                "cwd": cwd_str
            }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Execution error: {str(e)}\n",
            "exit_code": 1,
            "cwd": cwd_str
        }

# ── Codebase Knowledge Graph & SCIP Indexing ───────────────────────────

GRAPH_CACHE_FILE = Path("/app/data/knowledge_graph.json") if os.path.exists("/app/data") else (WORKSPACE_ROOT / "knowledge_graph.json")
ACTIVE_KNOWLEDGE_GRAPH = {"nodes": [], "edges": [], "stats": {}}

def load_cached_knowledge_graph():
    global ACTIVE_KNOWLEDGE_GRAPH
    if GRAPH_CACHE_FILE.exists():
        try:
            ACTIVE_KNOWLEDGE_GRAPH = json_module.loads(GRAPH_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

load_cached_knowledge_graph()

def collect_workspace_code_files(root: Path, max_files: int = 150) -> List[Dict[str, str]]:
    """Walks the active workspace and gathers code/documentation files up to size limits."""
    valid_exts = {".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".json", ".yaml", ".yml", ".md"}
    collected = []
    
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith(".")]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext in valid_exts:
                if fn in [".DS_Store", "package-lock.json", "tsconfig.tsbuildinfo", "yarn.lock"]:
                    continue
                full_p = Path(dirpath) / fn
                try:
                    if full_p.is_file() and full_p.stat().st_size <= 500 * 1024:
                        rel_p = str(full_p.relative_to(root)).replace("\\", "/")
                        content = full_p.read_text(encoding="utf-8", errors="replace")
                        collected.append({"path": rel_p, "content": content})
                        if len(collected) >= max_files:
                            return collected
                except Exception:
                    pass
    return collected

@app.get("/api/workspace/graph")
def get_workspace_knowledge_graph():
    """Returns the cached Knowledge Graph (nodes, edges, stats) for the active workspace."""
    global ACTIVE_KNOWLEDGE_GRAPH
    if not ACTIVE_KNOWLEDGE_GRAPH.get("nodes") and GRAPH_CACHE_FILE.exists():
        load_cached_knowledge_graph()
    return ACTIVE_KNOWLEDGE_GRAPH

@app.post("/api/workspace/index-codebase")
async def index_workspace_codebase(req: Optional[IndexCodebaseRequest] = None):
    """Extracts SCIP symbols across multi-language files, builds Knowledge Graph, and indexes into RAG."""
    global ACTIVE_WORKSPACE_ROOT, ACTIVE_KNOWLEDGE_GRAPH
    import time
    start_time = time.time()
    
    files: List[Dict[str, str]] = []
    project_label = "workspace"

    if req and req.is_github and req.github_owner and req.github_repo:
        project_label = f"{req.github_owner}/{req.github_repo}"
        client = GitHubWorkspaceClient(token=req.github_token)
        branch = req.github_branch or "main"
        
        try:
            tree_data = await client.get_tree(req.github_owner, req.github_repo, branch=branch, token=req.github_token)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch GitHub tree: {e}")

        # Flatten tree to find code files
        candidate_paths: List[str] = []
        def find_code_files(items: List[Dict[str, Any]], prefix: str = ""):
            valid_exts = {".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".json", ".yaml", ".yml", ".md"}
            for item in items:
                name = item.get("name", "")
                path = item.get("path") or f"{prefix}/{name}".lstrip("/")
                if item.get("type") in ["dir", "directory"] or item.get("is_dir") or "children" in item:
                    if name not in IGNORED_DIRS and not name.startswith("."):
                        find_code_files(item.get("children", []), path)
                else:
                    ext = os.path.splitext(name)[1].lower()
                    if ext in valid_exts and name not in [".DS_Store", "package-lock.json", "tsconfig.tsbuildinfo", "yarn.lock"]:
                        candidate_paths.append(path)

        find_code_files(tree_data)

        # Fetch contents for up to 100 candidate files concurrently with semaphore
        sem = asyncio.Semaphore(8)
        async def fetch_file(fpath: str):
            async with sem:
                try:
                    res = await client.get_file_content(req.github_owner, req.github_repo, fpath, branch=branch, token=req.github_token)
                    return {"path": fpath, "content": res.get("content", "")}
                except Exception:
                    return None

        tasks = [fetch_file(p) for p in candidate_paths[:100]]
        fetched = await asyncio.gather(*tasks)
        files = [f for f in fetched if f and f.get("content")]

    else:
        target_root = ACTIVE_WORKSPACE_ROOT
        if req and req.workspace_path and req.workspace_path.strip():
            target_root = normalize_workspace_path(req.workspace_path)
            if not target_root.exists() or not target_root.is_dir():
                raise HTTPException(status_code=404, detail=f"Workspace path does not exist: {req.workspace_path}")
            ACTIVE_WORKSPACE_ROOT = target_root

        project_label = target_root.name
        files = collect_workspace_code_files(target_root, max_files=150)

    if not files:
        return {
            "status": "warning",
            "message": f"No indexable code or documentation files found in {project_label}.",
            "files_scanned": 0,
            "total_chunks": 0,
            "graph": {"nodes": [], "edges": []}
        }
    
    # 1. Send files to Ingestion Service for SCIP AST extraction
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            scip_resp = await client.post(
                f"{INGESTION_SERVICE_URL}/api/scip/index",
                json={"files": files}
            )
            if scip_resp.status_code != 200:
                raise HTTPException(status_code=500, detail=f"SCIP Extraction Failed: {scip_resp.text}")
            scip_data = scip_resp.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error connecting to Ingestion Service: {e}")
        
        chunks = scip_data.get("chunks", [])
        graph = scip_data.get("graph", {"nodes": [], "edges": []})
        stats = scip_data.get("stats", {})
        
        # 2. Ingest high-signal chunks into RAG Service (clearing old repo chunks)
        if chunks:
            try:
                rag_resp = await client.post(
                    f"{RAG_SERVICE_URL}/api/ingest",
                    json={"chunks": chunks, "clear_existing": True}
                )
                if rag_resp.status_code != 200:
                    print(f"Warning: RAG ingestion responded with {rag_resp.status_code}")
            except Exception as e:
                print(f"Warning: Failed to forward chunks to RAG: {e}")
    
    # 3. Persist Knowledge Graph to disk and memory
    ACTIVE_KNOWLEDGE_GRAPH = {
        "nodes": graph.get("nodes", []),
        "edges": graph.get("edges", []),
        "stats": stats,
        "project": project_label,
        "last_indexed": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    try:
        GRAPH_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        GRAPH_CACHE_FILE.write_text(json_module.dumps(ACTIVE_KNOWLEDGE_GRAPH, indent=2), encoding="utf-8")
        if not (req and req.is_github) and 'target_root' in locals() and target_root.exists():
            (target_root / "knowledge_graph.json").write_text(json_module.dumps(ACTIVE_KNOWLEDGE_GRAPH, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"Warning: Failed to persist knowledge_graph.json: {e}")
        
    duration_ms = int((time.time() - start_time) * 1000)
    
    return {
        "status": "success",
        "project": project_label,
        "files_scanned": len(files),
        "endpoints_count": stats.get("endpoints", 0),
        "functions_count": stats.get("functions", 0),
        "classes_count": stats.get("classes", 0),
        "total_chunks": len(chunks),
        "graph_nodes_count": len(graph.get("nodes", [])),
        "graph_edges_count": len(graph.get("edges", [])),
        "duration_ms": duration_ms,
        "graph": ACTIVE_KNOWLEDGE_GRAPH,
        "stats": stats
    }

@app.post("/api/agent/suggest-files")
async def api_suggest_files(req: SuggestFilesRequest):
    """Evaluates developer prompt against Knowledge Graph to suggest 1-2 core context files (95/2 rule)."""
    global ACTIVE_KNOWLEDGE_GRAPH
    if not ACTIVE_KNOWLEDGE_GRAPH.get("nodes") and GRAPH_CACHE_FILE.exists():
        load_cached_knowledge_graph()

    suggestions = await suggest_context_files(
        user_prompt=req.prompt,
        knowledge_graph=ACTIVE_KNOWLEDGE_GRAPH,
        active_file_path=req.active_file_path,
        attached_files=req.attached_files
    )
    return {"suggestions": suggestions}

# ── Clone-Free Remote GitHub Workspaces & Auto-Fork ───────────────────────

@app.post("/api/github/open-repo")
async def github_open_repo(req: GitHubOpenRequest):
    """Opens a remote GitHub repository without local cloning, auditing push access."""
    raw_url = req.repo_url.strip()
    if "github.com/" in raw_url:
        parts = raw_url.split("github.com/")[-1].strip("/").split("/")
    else:
        parts = raw_url.strip("/").split("/")
    
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository format. Use 'owner/repo' or full GitHub URL.")
    
    owner = parts[0]
    repo = parts[1].replace(".git", "")
    
    client = GitHubWorkspaceClient(token=req.token)
    try:
        repo_info = await client.get_repo_info(owner, repo, token=req.token)
        branch = req.branch or repo_info.get("default_branch", "main")
        tree = await client.get_tree(owner, repo, branch=branch, token=req.token)

        # Shallow-clone repository locally so real files exist on disk for AST conformance & IDE persistence
        cloned_path_str = None
        try:
            from conformance.studio.github_import import import_github_repo
            slug = f"{owner}/{repo}"
            cloned_dir = import_github_repo(slug, WORKSPACE_ROOT, branch=branch)
            global ACTIVE_WORKSPACE_ROOT, RECENT_PROJECTS
            ACTIVE_WORKSPACE_ROOT = cloned_dir
            cloned_path_str = str(cloned_dir).replace("\\", "/")
            if cloned_path_str not in RECENT_PROJECTS:
                RECENT_PROJECTS.insert(0, cloned_path_str)
        except Exception as e:
            print(f"Warning: Local cloning of {owner}/{repo} failed: {e}")

        return {
            "status": "success",
            "repo_info": repo_info,
            "branch": branch,
            "tree": tree,
            "cloned_path": cloned_path_str
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/github/file")
async def github_get_file(owner: str, repo: str, path: str, branch: str = "main", token: Optional[str] = None):
    """Reads a single file blob from GitHub without cloning."""
    client = GitHubWorkspaceClient(token=token)
    try:
        data = await client.get_file_content(owner, repo, path, branch, token=token)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/github/save")
async def github_save_file(req: GitHubSaveRequest):
    """Directly commits updated file content to GitHub repository without local git clone."""
    client = GitHubWorkspaceClient(token=req.token)
    try:
        res = await client.save_file_content(
            owner=req.owner,
            repo=req.repo,
            path=req.path,
            content=req.content,
            commit_message=req.commit_message or f"Update {req.path} via Archon Copilot",
            branch=req.branch,
            sha=req.sha or "",
            token=req.token
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/github/fork")
async def github_fork_repo(req: GitHubForkRequest):
    """Forks a read-only repository to the authenticated user's account with 1-click."""
    client = GitHubWorkspaceClient(token=req.token)
    try:
        res = await client.fork_repo(owner=req.owner, repo=req.repo, token=req.token)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DeleteItemRequest(BaseModel):
    path: str

class RenameItemRequest(BaseModel):
    old_path: str
    new_path: str

@app.get("/api/workspace/tree")
def get_workspace_tree(subpath: str = ""):
    """Returns a recursive file & folder tree of the active project workspace."""
    global ACTIVE_WORKSPACE_ROOT
    target_dir = (ACTIVE_WORKSPACE_ROOT / subpath).resolve()
    if not str(target_dir).startswith(str(ACTIVE_WORKSPACE_ROOT)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    def build_tree(dir_path: Path, current_depth: int = 0, max_depth: int = 6):
        items = []
        if current_depth > max_depth:
            return items
        try:
            with os.scandir(dir_path) as it:
                entries = sorted(list(it), key=lambda e: (not e.is_dir(follow_symlinks=False), e.name.lower()))
                count = 0
                for entry in entries:
                    if count >= 300:
                        break
                    
                    # Ignore hidden internal directories and virtualenvs
                    if entry.is_dir(follow_symlinks=False):
                        if entry.name in IGNORED_DIRS or entry.name.startswith("."):
                            continue
                    elif entry.is_file(follow_symlinks=False):
                        if entry.name in [".DS_Store", "Thumbs.db"] or entry.name.endswith((".pyc", ".tmp", ".swp")):
                            continue

                    full_path = Path(entry.path)
                    rel_path = str(full_path.relative_to(ACTIVE_WORKSPACE_ROOT)).replace("\\", "/")
                    if entry.is_dir(follow_symlinks=False):
                        items.append({
                            "name": entry.name,
                            "path": rel_path,
                            "type": "directory",
                            "children": build_tree(full_path, current_depth + 1, max_depth) if current_depth < max_depth else []
                        })
                    else:
                        ext = full_path.suffix.lower().lstrip(".")
                        items.append({
                            "name": entry.name,
                            "path": rel_path,
                            "type": "file",
                            "extension": ext
                        })
                    count += 1
        except Exception:
            pass
        return items

    is_user_home = str(ACTIVE_WORKSPACE_ROOT).rstrip("/") in ("/mnt/c/Users", "/home") or ACTIVE_WORKSPACE_ROOT.parent == Path("/mnt/c/Users")
    return {
        "root": str(ACTIVE_WORKSPACE_ROOT.name),
        "root_path": str(ACTIVE_WORKSPACE_ROOT).replace("\\", "/"),
        "tree": build_tree(target_dir, 0, 2 if is_user_home else 6)
    }

@app.get("/api/workspace/all-files")
def get_all_workspace_files():
    """Returns a flat list of all searchable file paths for instant Ctrl+P Quick Open."""
    global ACTIVE_WORKSPACE_ROOT
    files = []
    try:
        for root, dirs, filenames in os.walk(ACTIVE_WORKSPACE_ROOT):
            # Prune ignored directories in-place for high performance
            dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
            for fn in filenames:
                if fn in [".DS_Store", "Thumbs.db"] or fn.endswith((".pyc", ".tmp", ".swp")):
                    continue
                full_path = Path(root) / fn
                rel_path = str(full_path.relative_to(ACTIVE_WORKSPACE_ROOT)).replace("\\", "/")
                files.append({
                    "name": fn,
                    "path": rel_path,
                    "extension": full_path.suffix.lower().lstrip(".")
                })
                if len(files) >= 1500:
                    break
            if len(files) >= 1500:
                break
    except Exception:
        pass
    return {"files": files}

def resolve_file_or_workspace_path(path_str: str) -> Path:
    """Resolves a relative or absolute file path anywhere on mounted drives (/workspace, /mnt/c, /mnt/d) or workspace root."""
    global ACTIVE_WORKSPACE_ROOT
    cleaned = path_str.strip().replace("\\", "/")
    
    # Check if absolute Windows or Linux path
    if (len(cleaned) >= 2 and cleaned[1] == ":") or cleaned.startswith("/mnt/") or cleaned.startswith("/workspace"):
        target = normalize_workspace_path(cleaned)
    else:
        target = (ACTIVE_WORKSPACE_ROOT / cleaned).resolve()
        
    return target

@app.get("/api/workspace/file")
def read_workspace_file(path: str):
    """Reads the raw text content of a workspace file anywhere on PC / mounted drives."""
    target_file = resolve_file_or_workspace_path(path)
    if not target_file.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    try:
        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return {"path": path, "content": content, "filename": target_file.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/workspace/file")
def save_workspace_file(req: FileContentRequest):
    """Saves updated text content to a file in workspace or anywhere on mounted drives."""
    target_file = resolve_file_or_workspace_path(req.path)
    try:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", encoding="utf-8") as f:
            f.write(req.content or "")
        return {"status": "success", "path": req.path, "bytes_written": len(req.content or "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/workspace/create")
def create_workspace_item(req: CreateFileRequest):
    """Creates a new file or directory anywhere in workspace or mounted drives."""
    target_path = resolve_file_or_workspace_path(req.path)
    try:
        if req.is_directory:
            target_path.mkdir(parents=True, exist_ok=True)
        else:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            if not target_path.exists():
                target_path.touch()
        return {"status": "success", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/workspace/delete")
def delete_workspace_item(req: DeleteItemRequest):
    """Deletes a file or directory."""
    global ACTIVE_WORKSPACE_ROOT
    import shutil
    target_path = resolve_file_or_workspace_path(req.path)
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="File or folder not found")
    
    # Prevent deleting root drives
    if str(target_path) in ["/", "/mnt", "/mnt/c", "/mnt/d", "/workspace", "C:/", "D:/", "C:", "D:"]:
        raise HTTPException(status_code=403, detail="Cannot delete root system drive")

    try:
        if target_path.is_dir():
            shutil.rmtree(target_path)
        else:
            target_path.unlink()
        return {"status": "success", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/workspace/rename")
def rename_workspace_item(req: RenameItemRequest):
    """Renames or moves a file or directory."""
    global ACTIVE_WORKSPACE_ROOT
    import shutil
    old_target = resolve_file_or_workspace_path(req.old_path)
    new_target = resolve_file_or_workspace_path(req.new_path)

    if not old_target.exists():
        raise HTTPException(status_code=404, detail="Source file not found")
    if new_target.exists() and new_target != old_target:
        raise HTTPException(status_code=400, detail="Destination already exists")

    try:
        new_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_target), str(new_target))
        return {"status": "success", "old_path": req.old_path, "new_path": req.new_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Copilot Agent Multi-Turn Chat Endpoint ────────────────────────────────

@app.post("/api/agent/chat")
async def agent_chat(req: AgentChatRequest):
    """Multi-turn Copilot Agent endpoint with Hybrid RAG retrieval, active file context, and conversational guardrails."""
    # Find latest user message
    latest_user_msg = next((m.content for m in reversed(req.messages) if m.role == "user"), "").strip()
    is_greeting = latest_user_msg.lower() in ["hi", "hello", "hey", "sup", "greetings", "good morning", "good evening", "how are you", "who are you"]

    # Hybrid RAG Context Retrieval (Dual-stream BM25 + Dense + Cross-Encoder)
    rag_context = ""
    rag_sources_list = []
    if latest_user_msg and not is_greeting and len(latest_user_msg) > 3:
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                search_resp = await client.post(
                    f"{RAG_SERVICE_URL}/api/search",
                    json={"query": latest_user_msg, "top_k": 3}
                )
                if search_resp.status_code == 200:
                    search_data = search_resp.json()
                    cross_results = search_data.get("cross_encoder", [])
                    raw_chunks = [c for c in cross_results if isinstance(c, dict) and "text" in c and c.get("score") != "N/A"]

                    # Quality Gate: Drop complete irrelevance (score < -10.2) and steep drop-offs (> 2.2 points below top match)
                    valid_chunks = []
                    top_score = None
                    for c in raw_chunks:
                        raw_score = str(c.get("score", "")).replace("Logit:", "").strip()
                        try:
                            s = float(raw_score)
                        except (ValueError, TypeError):
                            s = -15.0

                        # Discard complete irrelevance
                        if s < -10.2:
                            continue

                        if top_score is None:
                            top_score = s
                            valid_chunks.append(c)
                        else:
                            # Drop padding chunks that drop drastically below the best match
                            if (top_score - s) <= 2.2:
                                valid_chunks.append(c)

                    if valid_chunks:
                        context_chunks = []
                        for rank, c in enumerate(valid_chunks, 1):
                            raw_txt = c["text"]
                            chunk_type = c.get("chunk_type", "api_spec")
                            file_name = c.get("file_path") or c.get("source") or "spec.yaml"
                            symbol_name = c.get("symbol_name") or c.get("endpoint") or ""
                            line_range = c.get("line_range") or ""
                            
                            if chunk_type == "code_symbol":
                                title = f"Code Symbol: {symbol_name}" if symbol_name else f"Code: {file_name}"
                                citation_header = f"[Code Citation #{rank}: {file_name} {line_range}]"
                            else:
                                title = c.get("api_title") or "API Specification"
                                citation_header = f"[Spec Citation #{rank}: {file_name}]"
                                
                            context_chunks.append(f"{citation_header}\n{raw_txt}")

                            rag_sources_list.append({
                                "title": title,
                                "file": file_name,
                                "score": str(c.get("score", "0.92")),
                                "rank": c.get("rank", rank),
                                "text": raw_txt,
                                "line_range": line_range,
                                "chunk_type": chunk_type
                            })
                        rag_context = "\n\n---\n\n".join(context_chunks)
        except Exception as e:
            print(f"Warning: Agent RAG retrieval failed: {e}")

    # Flow & Architecture Resolution via Knowledge Graph
    flow_result = {"is_flow": False, "steps": [], "flow_node_ids": [], "markdown_trace": ""}
    if latest_user_msg and is_flow_query(latest_user_msg) and ACTIVE_KNOWLEDGE_GRAPH.get("nodes"):
        try:
            tracer = FlowTracer(ACTIVE_KNOWLEDGE_GRAPH)
            flow_result = tracer.trace_flow(latest_user_msg)
        except Exception as e:
            print(f"Warning: FlowTracer execution error: {e}")

    system_prompt = """You are Archon Agent, an elite AI pair programmer and software architect embedded directly into the developer's IDE.
You write clean, modular, production-ready code with rigorous adherence to best practices.

### PAIR PROGRAMMING & CODE GENERATION RULES:
1. GREETINGS & ARCHITECTURAL / FLOW QUESTIONS:
   - If the user is greeting you (e.g. 'hi', 'hello', 'hey'), respond concisely and warmly asking what task or code they want to work on. DO NOT generate code for simple greetings.
   - If the user is asking an ARCHITECTURAL, INFORMATIONAL, or EXECUTION-FLOW question (e.g. "how do we...", "where is...", "how does...", "what happens when..."):
     - Respond directly in structured, professional markdown with clear numbered steps and bullet points.
     - DO NOT wrap conversational explanations inside a fictional script or python dictionary (e.g. do NOT create files like `describe_flow.py`).

2. NEW OR EMPTY FILES (FOR CODING TASKS ONLY):
   - ONLY when the user explicitly asks to implement, write, or generate a new file or feature, and the active editor file is EMPTY or BLANK:
   - NEVER use SEARCH/REPLACE diff blocks.
   - ALWAYS output the complete implementation inside standard fenced markdown (```python, ```typescript, etc.) and include `# filename: <filename>` at the top of the block.
   ```python
   # filename: send_twilio_sms.py
   // complete implementation
   ```

3. SURGICAL EDITING ON EXISTING FILES WITH CODE:
   - ONLY when editing, refactoring, fixing bugs, or modifying a NON-EMPTY file that already contains code:
   - Enclose your SEARCH/REPLACE diff blocks inside standard fenced markdown (```python or ```diff):
   ```python
   <<<<<<< SEARCH
   // exact lines of existing code from the file to match (including 1-2 surrounding lines)
   =======
   // updated replacement code
   >>>>>>> REPLACE
   ```
   - The SEARCH block MUST uniquely match actual lines existing in the file.
   - DELETION: To delete lines, put the exact lines in SEARCH and leave REPLACE empty.
   - ADDITION: To add code at a location, put the surrounding anchor line in SEARCH, and put the anchor line plus your new code in REPLACE.

4. STRICTLY FORBIDDEN (NEVER DO THESE):
   - NEVER output placeholder comments like `// ... rest of code ...`, `// ... unchanged ...`, `// ... (remaining code) ...`, `/* ... */`, `# ... rest remains the same ...`, or any ellipsis/abbreviation of existing code.
   - NEVER abbreviate or summarize existing code with comments like "rest of the code remains unchanged".
   - Every line in the REPLACE block must be actual, complete, executable code — never a placeholder or summary.
   - If you cannot fit the full replacement, output multiple smaller SEARCH/REPLACE blocks instead.

5. CODE QUALITY:
   - Maintain correct imports, type annotations, and robust error handling.
   - Use the retrieved API Documentation Context and Active Editor File context below to provide 100% accurate, production-ready code.

6. ARCHITECTURAL & EXECUTION-FLOW QUERIES (CRITICAL):
   - When the user asks "how do we...", "where is...", "what happens when...", or asks about the architecture or execution flow of an action (e.g. sending certificates, processing checkout, ticket triage, notifications):
   - Check the "Retrieved Enterprise Documentation" and "Discovered Codebase Architecture Flow" below.
   - If an architectural README or runtime guide is in the retrieved context (e.g. a "Runtime Flow" section in a module README): Synthesize and clearly explain that exact documented runtime flow step-by-step.
   - Ground your 4-stage execution breakdown STRICTLY in the real files discovered in the flow trace:
     - 01. UI Trigger & Button: Exact component file (<component_file>:<line>), action name, and onClick event.
     - 02. Client Request & API Route: Exact HTTP Method, route (<api_route>), and request body parameters.
     - 03. Backend Controller & Handler: Exact file path and handler function name (<handler_file>:<line>).
     - 04. Downstream Service: Exact dispatch service (<service_file>:<line>).
   - STRICTLY FORBIDDEN:
     - NEVER wrap your explanation inside a python script, function, or dictionary code block (e.g. do NOT output ```python ... ``` for architecture explanations).
     - NEVER invent fictional file paths (e.g. NEVER invent "routers/certificates.py" or "send_certificate.ts") or imaginary endpoints.
     - NEVER output placeholder comments like "// In a real application, you would use an email library like Nodemailer" or "// replace with actual logic".
     - If a file, route, or UI button does not exist in the codebase or retrieved context, explicitly state: "No existing implementation found in the repository."
"""

    if flow_result.get("markdown_trace"):
        system_prompt += f"\n\n{flow_result['markdown_trace']}\n"

    if rag_context:
        system_prompt += f"\n\n### Retrieved Enterprise API Documentation (via Hybrid RAG):\n```\n{rag_context}\n```\n"

    if req.active_file_path:
        content_stripped = (req.active_file_content or "").strip()
        if content_stripped and len(content_stripped) > 10:
            file_preview = (content_stripped[:15000] + "\n...[truncated]") if len(content_stripped) > 15000 else content_stripped
            system_prompt += f"\n\n### Current Active Editor File: `{req.active_file_path}` (Non-Empty Existing Code):\n```\n{file_preview}\n```\n"
        else:
            system_prompt += f"\n\n### Current Active Editor File: `{req.active_file_path}` (Currently EMPTY / NEW FILE - Provide complete implementation, DO NOT use SEARCH/REPLACE diffs).\n"

    if req.context_files:
        context_files_text = []
        for cf in req.context_files:
            c_text = (cf.content or "").strip()
            if not c_text:
                try:
                    fpath = resolve_file_or_workspace_path(cf.path)
                    if fpath.is_file():
                        c_text = fpath.read_text(encoding="utf-8", errors="replace").strip()
                except Exception:
                    pass
            if c_text:
                preview = (c_text[:15000] + "\n...[truncated]") if len(c_text) > 15000 else c_text
                context_files_text.append(f"### Attached User Context File: `{cf.path}`\n```\n{preview}\n```")
        if context_files_text:
            system_prompt += "\n\n" + "\n\n".join(context_files_text) + "\n"

    # Build clean structured message history for Ollama /api/chat
    ollama_messages = [{"role": "system", "content": system_prompt}]
    for msg in req.messages:
        content_str = msg.content.strip()
        # Skip the static frontend welcome banner
        if msg.role == "assistant" and ("👋 **Hello! I am Archon Agent" in content_str or "👋 Hello! I am Archon Agent" in content_str):
            continue
        if content_str:
            ollama_messages.append({"role": msg.role, "content": content_str})

    async def token_stream():
        # First emit RAG sources metadata if available
        if rag_sources_list:
            yield f"data: {json_module.dumps({'rag_sources': rag_sources_list})}\n\n"

        # Emit Flow sequence if available for neural visualizer
        if flow_result.get("flow_node_ids"):
            yield f"data: {json_module.dumps({'flow_sequence': flow_result['flow_node_ids'], 'flow_steps': flow_result['steps']})}\n\n"

        # Determine if the model is a cloud model or local Ollama model
        keys = load_api_keys()
        fl_key, fl_url, fl_model, _ = _get_freellmapi_config(keys)
        groq_key, _ = _get_groq_key(keys)

        cloud_provider = None
        cloud_model = req.model
        if req.model.startswith("freellmapi:"):
            cloud_provider = "freellmapi"
            cloud_model = req.model.split(":", 1)[1].strip() or fl_model
        elif req.model.startswith("groq:"):
            cloud_provider = "groq"
            cloud_model = req.model.split(":", 1)[1].strip() or "openai/gpt-oss-120b"
        else:
            for provider, models in CLOUD_MODELS.items():
                if req.model in models:
                    cloud_provider = provider
                    break
            if not cloud_provider and req.model in _GROQ_LIVE_MODELS:
                cloud_provider = "groq"
            elif not cloud_provider and req.model.startswith("gemini-"):
                cloud_provider = "gemini"

        if cloud_provider == "freellmapi":
            active_key = fl_key
        elif cloud_provider == "groq":
            active_key = groq_key
        else:
            active_key = keys.get(cloud_provider) if cloud_provider else None

        if cloud_provider and active_key:
            api_key = active_key
            try:
                if cloud_provider in ("openai", "groq", "freellmapi"):
                    if cloud_provider == "freellmapi":
                        endpoint = f"{fl_url}/chat/completions"
                        label = "FreeLLMAPI"
                        timeout_s = 90.0
                    elif cloud_provider == "groq":
                        endpoint = "https://api.groq.com/openai/v1/chat/completions"
                        label = "Groq"
                        timeout_s = 60.0
                    else:
                        endpoint = "https://api.openai.com/v1/chat/completions"
                        label = "OpenAI"
                        timeout_s = 60.0
                    async for event_chunk in _stream_openai_compatible(
                        endpoint=endpoint,
                        api_key=api_key,
                        model=cloud_model,
                        messages=ollama_messages,
                        temperature=req.temperature or 0.2,
                        provider_label=label,
                        timeout_s=timeout_s,
                    ):
                        yield event_chunk

                elif cloud_provider == "anthropic":
                    async with httpx.AsyncClient() as client:
                        system_content = ollama_messages[0]["content"] if ollama_messages and ollama_messages[0]["role"] == "system" else ""
                        chat_messages = [m for m in ollama_messages if m["role"] != "system"]
                        async with client.stream(
                            "POST",
                            "https://api.anthropic.com/v1/messages",
                            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                            json={"model": req.model, "max_tokens": 8192, "system": system_content, "messages": chat_messages, "stream": True, "temperature": req.temperature or 0.2},
                            timeout=60.0
                        ) as response:
                            if response.status_code != 200:
                                err_body = (await response.aread()).decode("utf-8", errors="replace")
                                yield f"data: {json_module.dumps({'error': f'Anthropic API Error ({response.status_code}): {err_body}'})}\n\n"
                                return
                            async for line in response.aiter_lines():
                                if line.startswith("data: "):
                                    try:
                                        chunk = json_module.loads(line[6:])
                                        if chunk.get("type") == "content_block_delta":
                                            token = chunk.get("delta", {}).get("text", "")
                                            if token:
                                                yield f"data: {json_module.dumps({'token': token})}\n\n"
                                    except json_module.JSONDecodeError:
                                        continue
                            yield f"data: {json_module.dumps({'done': True})}\n\n"

                elif cloud_provider == "gemini":
                    async with httpx.AsyncClient() as client:
                        system_content = ollama_messages[0]["content"] if ollama_messages and ollama_messages[0]["role"] == "system" else ""
                        chat_messages = [m for m in ollama_messages if m["role"] != "system"]
                        gemini_contents = [
                            {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
                            for m in chat_messages
                        ]
                        if not gemini_contents:
                            gemini_contents = [{"role": "user", "parts": [{"text": "Hello"}]}]

                        gemini_payload = {
                            "contents": gemini_contents,
                            "generationConfig": {"temperature": req.temperature or 0.2}
                        }
                        if system_content:
                            gemini_payload["systemInstruction"] = {"parts": [{"text": system_content}]}

                        errors: list[tuple[str, int, str]] = []
                        key_id = _gemini_key_id(api_key)
                        candidates = _gemini_endpoints(api_key, req.model, stream=True)
                        for idx, (kind, endpoint_url) in enumerate(candidates):
                            async with client.stream(
                                "POST",
                                endpoint_url,
                                headers={"Content-Type": "application/json", "x-goog-api-key": api_key.strip()},
                                json=gemini_payload,
                                timeout=60.0
                            ) as response:
                                if response.status_code != 200:
                                    err_body = (await response.aread()).decode("utf-8", errors="replace")
                                    errors.append((kind, response.status_code, _extract_provider_error(err_body, response.status_code)))
                                    if response.status_code in (400, 401, 403) and idx + 1 < len(candidates):
                                        continue
                                    break
                                _remember_gemini_route(key_id, kind)
                                async for line in response.aiter_lines():
                                    if line.startswith("data: "):
                                        try:
                                            chunk = json_module.loads(line[6:])
                                            cand_list = chunk.get("candidates", [])
                                            if cand_list:
                                                parts = cand_list[0].get("content", {}).get("parts", [])
                                                for part in parts:
                                                    token = part.get("text", "")
                                                    if token:
                                                        yield f"data: {json_module.dumps({'token': token})}\n\n"
                                        except (json_module.JSONDecodeError, IndexError):
                                            continue
                                yield f"data: {json_module.dumps({'done': True})}\n\n"
                                return
                        if errors:
                            yield f"data: {json_module.dumps({'error': f'Gemini API Error: {_select_gemini_error(errors)}'})}\n\n"

            except Exception as e:
                err_msg = str(e) if str(e) else repr(e)
                yield f"data: {json_module.dumps({'error': f'Cloud API Error ({cloud_provider}): {err_msg}'})}\n\n"
        else:
            # Local Ollama model streaming
            async with httpx.AsyncClient() as client:
                try:
                    async with client.stream(
                        "POST",
                        f"{get_ollama_url()}/api/chat",
                        json={
                            "model": req.model,
                            "messages": ollama_messages,
                            "stream": True,
                            "options": {"temperature": req.temperature or 0.2}
                        },
                        timeout=None
                    ) as response:
                        async for line in response.aiter_lines():
                            if line.strip():
                                try:
                                    chunk = json_module.loads(line)
                                    token = chunk.get("message", {}).get("content", "")
                                    if token:
                                        yield f"data: {json_module.dumps({'token': token})}\n\n"
                                    if chunk.get("done", False):
                                        yield f"data: {json_module.dumps({'done': True})}\n\n"
                                        break
                                except json_module.JSONDecodeError:
                                    continue
                except Exception as e:
                    err_msg = str(e) if str(e) else repr(e)
                    yield f"data: {json_module.dumps({'error': f'Agent Inference Error: {err_msg}'})}\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")

@app.post("/api/agent/apply-edit")
def apply_agent_edit(req: FileContentRequest):
    """Directly applies an AI-generated code edit to the active workspace file."""
    global ACTIVE_WORKSPACE_ROOT
    target_file = (ACTIVE_WORKSPACE_ROOT / req.path).resolve()
    if not str(target_file).startswith(str(ACTIVE_WORKSPACE_ROOT)):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", encoding="utf-8") as f:
            f.write(req.content or "")
        return {
            "status": "success",
            "path": req.path,
            "filename": target_file.name,
            "bytes_written": len(req.content or ""),
            "content": req.content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Cloud LLM API Key Management ──────────────────────────────────────────

from urllib.parse import urlsplit, urlunsplit

API_KEYS_FILE = Path("/app/data/api_keys.json") if os.path.exists("/app") else Path(os.path.expanduser("~/.archon_api_keys.json"))
DEFAULT_FREELLMAPI_URL = (
    "http://host.docker.internal:31415/v1"
    if (os.path.exists("/.dockerenv") or os.path.exists("/app"))
    else "http://127.0.0.1:31415/v1"
)
ALLOWED_CLOUD_PROVIDERS = ["openai", "anthropic", "gemini", "groq", "freellmapi"]
_GROQ_LIVE_MODELS: set[str] = set()


def _get_groq_key(keys: Optional[dict] = None) -> tuple[str, bool]:
    data = keys if keys is not None else load_api_keys()
    ide_key = str(data.get("groq") or "").strip()
    arcgen_key = ""
    if not ide_key:
        for settings_path in (
            Path("/workspace/services/arcgen_service/output/llm_settings.json"),
            Path(__file__).resolve().parent.parent.parent / "arcgen_service" / "output" / "llm_settings.json",
        ):
            if settings_path.is_file():
                try:
                    arcgen_key = str(
                        (json_module.loads(settings_path.read_text(encoding="utf-8")).get("keys") or {}).get("groq") or ""
                    ).strip()
                    if arcgen_key:
                        break
                except Exception:
                    pass
    env_key = (os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY_2") or "").strip()
    resolved = ide_key or arcgen_key or env_key
    from_env = bool(not ide_key and resolved)
    return resolved, from_env


def _filter_groq_chat_models(data: list) -> list[str]:
    skip = (
        "whisper", "tts", "guard", "prompt-guard", "orpheus",
        "arabic-saudi", "embed", "audio", "vision", "clip", "playai",
    )
    preferred = ("openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b")
    raw = {
        str(m.get("id", "")).strip()
        for m in (data or [])
        if isinstance(m, dict) and str(m.get("id", "")).strip()
        and not any(s in str(m.get("id", "")).lower() for s in skip)
    }
    ordered = [m for m in preferred if m in raw]
    rest = sorted(m for m in raw if m not in ordered)
    return ordered + rest


def _normalize_freellmapi_url(raw: Optional[str] = None) -> str:
    cleaned = (raw or "").strip().rstrip("/")
    if not cleaned:
        return DEFAULT_FREELLMAPI_URL
    for suffix in ("/chat/completions", "/models"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].rstrip("/")
    parsed = urlsplit(cleaned if "://" in cleaned else f"http://{cleaned}")
    host = parsed.hostname or ""
    in_docker = os.path.exists("/.dockerenv") or os.path.exists("/app")
    if in_docker and host in ("localhost", "127.0.0.1"):
        port_part = f":{parsed.port}" if parsed.port else ""
        netloc = f"host.docker.internal{port_part}"
    else:
        netloc = parsed.netloc
    path = parsed.path.rstrip("/") or "/v1"
    return urlunsplit((parsed.scheme or "http", netloc, path, "", "")).rstrip("/")


def _get_freellmapi_config(keys: Optional[dict] = None) -> tuple[str, str, str, bool]:
    data = keys if keys is not None else load_api_keys()
    ide_key = str(data.get("freellmapi") or "").strip()
    env_key = (os.getenv("FREELLMAPI_API_KEY") or "").strip()
    from_env = bool(not ide_key and env_key)
    api_key = ide_key or env_key
    raw_url = str(data.get("freellmapi_base_url") or os.getenv("FREELLMAPI_BASE_URL") or "").strip()
    model = str(data.get("freellmapi_model") or os.getenv("FREELLMAPI_MODEL") or "auto").strip() or "auto"
    return api_key, _normalize_freellmapi_url(raw_url), model, from_env


async def _stream_openai_compatible(
    endpoint: str,
    api_key: str,
    model: str,
    messages: list,
    temperature: float,
    provider_label: str,
    timeout_s: float = 60.0,
):
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            endpoint,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "stream": True, "temperature": temperature},
            timeout=timeout_s,
        ) as response:
            if response.status_code != 200:
                err_body = (await response.aread()).decode("utf-8", errors="replace")
                yield f"data: {json_module.dumps({'error': f'{provider_label} API Error: {_extract_provider_error(err_body, response.status_code)}'})}\n\n"
                return
            async for line in response.aiter_lines():
                if line.startswith("data: ") and line.strip() != "data: [DONE]":
                    try:
                        chunk = json_module.loads(line[6:])
                        choices = chunk.get("choices") or []
                        token = (choices[0].get("delta", {}) if choices else {}).get("content", "")
                        if token:
                            yield f"data: {json_module.dumps({'token': token})}\n\n"
                    except (json_module.JSONDecodeError, IndexError):
                        continue
            yield f"data: {json_module.dumps({'done': True})}\n\n"


def load_api_keys() -> dict:
    if API_KEYS_FILE.exists():
        try:
            return json_module.loads(API_KEYS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}

def save_api_keys(keys: dict):
    API_KEYS_FILE.parent.mkdir(parents=True, exist_ok=True)
    API_KEYS_FILE.write_text(json_module.dumps(keys, indent=2), encoding="utf-8")

class ApiKeyRequest(BaseModel):
    provider: str  # "openai", "anthropic", "gemini", "groq", "freellmapi"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None

class ApiKeyClearRequest(BaseModel):
    provider: str

CLOUD_MODELS = {
    "openai": ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3", "o4-mini"],
    "anthropic": ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
    "gemini": [
        "gemini-3.8-flash",
        "gemini-3.5-pro",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite"
    ],
    "groq": [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b"
    ]
}


def _mask_key(val: str) -> str:
    if not val:
        return ""
    if len(val) > 10:
        return val[:6] + "..." + val[-4:]
    return "***"


_GEMINI_VERTEX_KEYS: set[str] = set()


def _gemini_key_id(api_key: str) -> str:
    import hashlib
    return hashlib.sha256(api_key.strip().encode("utf-8")).hexdigest()


def _remember_gemini_route(key_id: str, kind: str) -> None:
    if kind == "vertex":
        _GEMINI_VERTEX_KEYS.add(key_id)
    else:
        _GEMINI_VERTEX_KEYS.discard(key_id)


def _gemini_endpoints(api_key: str, model: str, stream: bool = False) -> list[tuple[str, str]]:
    """Return ordered (kind, url) candidates for Gemini keys.

    Both AIza* and newer Google AI Studio AQ.* keys work on generativelanguage.googleapis.com.
    AQ.* keys created in Vertex AI Express Mode fall back to aiplatform.googleapis.com (and are
    remembered in-memory by key hash to skip the extra round-trip on subsequent calls).
    """
    key = api_key.strip()
    action = "streamGenerateContent?alt=sse" if stream else "generateContent"
    aistudio = ("aistudio", f"https://generativelanguage.googleapis.com/v1beta/models/{model}:{action}")
    if not key.startswith("AQ."):
        return [aistudio]
    vertex = ("vertex", f"https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:{action}")
    if _gemini_key_id(key) in _GEMINI_VERTEX_KEYS:
        return [vertex, aistudio]
    return [aistudio, vertex]


def _select_gemini_error(errors: list[tuple[str, int, str]]) -> str:
    """Pick the most informative error when trying AI Studio then Vertex AI Express."""
    if len(errors) > 1 and errors[0][1] in (400, 401) and errors[1][1] == 403:
        return errors[1][2]
    return errors[0][2]


def _extract_provider_error(body: str, status_code: int) -> str:
    """Extract a clean human-readable message from JSON error payloads (Google/OpenAI/Anthropic)."""
    try:
        parsed = json_module.loads(body)
        if isinstance(parsed, list) and parsed:
            parsed = parsed[0]
        if isinstance(parsed, dict):
            err = parsed.get("error")
            if isinstance(err, dict) and err.get("message"):
                return f"HTTP {status_code}: {err['message']}"
            if isinstance(err, str) and err:
                return f"HTTP {status_code}: {err}"
            if parsed.get("message"):
                return f"HTTP {status_code}: {parsed['message']}"
    except Exception:
        pass
    compact = " ".join(body.split())[:200]
    return f"HTTP {status_code}: {compact}"


@app.get("/api/cloud/keys")
def get_cloud_keys():
    """Returns which providers have API keys configured (without exposing key values)."""
    keys = load_api_keys()
    fl_key, fl_url, fl_model, fl_from_env = _get_freellmapi_config(keys)
    groq_key, groq_from_env = _get_groq_key(keys)
    providers = {
        provider: {
            "configured": bool(keys.get(provider)),
            "masked_key": _mask_key(str(keys.get(provider) or "")) if len(str(keys.get(provider) or "")) > 10 else "",
        }
        for provider in ["openai", "anthropic", "gemini"]
    }
    providers["groq"] = {
        "configured": bool(groq_key),
        "masked_key": _mask_key(groq_key),
        "source": "env" if groq_from_env else ("ide" if groq_key else ""),
    }
    providers["freellmapi"] = {
        "configured": bool(fl_key),
        "masked_key": _mask_key(fl_key),
        "base_url": fl_url,
        "model": fl_model,
        "source": "env" if fl_from_env else ("ide" if fl_key else ""),
    }
    return {
        "providers": providers,
        "cloud_models": CLOUD_MODELS,
    }

@app.post("/api/cloud/keys")
def set_cloud_key(req: ApiKeyRequest):
    """Stores an API key (and optional FreeLLMAPI endpoint/model settings) persistently."""
    if req.provider not in ALLOWED_CLOUD_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")
    keys = load_api_keys()
    raw_key = (req.api_key or "").strip()
    if req.provider == "freellmapi":
        existing = (keys.get("freellmapi") or os.getenv("FREELLMAPI_API_KEY") or "").strip()
        if not raw_key and not existing:
            raise HTTPException(status_code=400, detail="API key is required for freellmapi")
        if raw_key:
            keys["freellmapi"] = raw_key
        if req.base_url is not None:
            if req.base_url.strip():
                keys["freellmapi_base_url"] = _normalize_freellmapi_url(req.base_url)
            else:
                keys.pop("freellmapi_base_url", None)
        if req.model is not None:
            if req.model.strip():
                keys["freellmapi_model"] = req.model.strip()
            else:
                keys.pop("freellmapi_model", None)
        save_api_keys(keys)
        _, fl_url, fl_model, _ = _get_freellmapi_config(keys)
        return {"status": "success", "provider": req.provider, "base_url": fl_url, "model": fl_model}

    if not raw_key:
        raise HTTPException(status_code=400, detail=f"API key is required for {req.provider}")
    keys[req.provider] = raw_key
    save_api_keys(keys)
    return {"status": "success", "provider": req.provider}

@app.post("/api/cloud/keys/clear")
def clear_cloud_key(req: ApiKeyClearRequest):
    """Removes a stored API key for a cloud LLM provider."""
    keys = load_api_keys()
    if req.provider == "freellmapi":
        for k in ("freellmapi", "freellmapi_base_url", "freellmapi_model"):
            keys.pop(k, None)
        save_api_keys(keys)
    elif req.provider in keys:
        del keys[req.provider]
        save_api_keys(keys)
    return {"status": "cleared", "provider": req.provider}

@app.get("/api/models")
async def get_models_extended():
    """Returns all available models: local Ollama + cloud providers with configured keys."""
    local_models = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            response = await client.get(f"{get_ollama_url()}/api/tags")
            if response.status_code == 200:
                local_models = [m["name"] for m in response.json().get("models", [])]
        except Exception:
            local_models = ["gemma3:4b"]

    keys = load_api_keys()
    cloud_models_available = []
    for provider, models in CLOUD_MODELS.items():
        if provider != "groq" and keys.get(provider):
            cloud_models_available.extend(models)

    gemini_key = (keys.get("gemini") or "").strip()
    if gemini_key:
        try:
            async with httpx.AsyncClient(timeout=4.0) as g_client:
                g_res = await g_client.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    headers={"x-goog-api-key": gemini_key},
                )
            if g_res.status_code == 200:
                skip = (
                    "tts", "live", "image", "embedding", "aqa", "vision",
                    "veo", "imagen", "learnlm", "gemma", "deep-research", "computer-use",
                )
                for m in g_res.json().get("models", []):
                    methods = m.get("supportedGenerationMethods") or []
                    name = str(m.get("name", "")).removeprefix("models/")
                    if (
                        "generateContent" in methods
                        and name.startswith("gemini-")
                        and not any(s in name.lower() for s in skip)
                        and name not in cloud_models_available
                    ):
                        cloud_models_available.append(name)
        except Exception:
            pass

    groq_key, _ = _get_groq_key(keys)
    if groq_key:
        live_groq: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=4.0) as gr_client:
                gr_res = await gr_client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {groq_key}"},
                )
            if gr_res.status_code == 200:
                live_groq = _filter_groq_chat_models(gr_res.json().get("data", []))
                _GROQ_LIVE_MODELS.update(live_groq)
        except Exception:
            pass
        for candidate in (live_groq or CLOUD_MODELS["groq"]):
            if candidate not in cloud_models_available:
                cloud_models_available.append(candidate)

    fl_key, _, fl_model, _ = _get_freellmapi_config(keys)
    if fl_key:
        for candidate in (f"freellmapi:{fl_model}", "freellmapi:auto", "freellmapi:auto:smart", "freellmapi:auto:fast"):
            if candidate not in cloud_models_available:
                cloud_models_available.append(candidate)

    return {"models": local_models + cloud_models_available}


class OllamaTunnelRequest(BaseModel):
    url: str


@app.post("/api/ollama/tunnel")
def register_ollama_tunnel(req: OllamaTunnelRequest):
    """Registers an active Ollama tunnel URL dynamically."""
    clean = req.url.strip().rstrip("/")
    try:
        Path("/tmp/ollama_url.txt").write_text(clean)
    except Exception as e:
        logger.warning(f"Could not write /tmp/ollama_url.txt: {e}")
    return {"status": "connected", "ollama_url": clean}

class ApiKeyTestRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None

@app.post("/api/cloud/keys/test")
async def test_cloud_key(req: ApiKeyTestRequest):
    """Tests connection to a cloud provider with the stored or supplied API key."""
    import time
    keys = load_api_keys()
    api_key = (req.api_key or keys.get(req.provider, "")).strip()
    if req.provider == "freellmapi":
        fl_key, fl_url, fl_model, _ = _get_freellmapi_config(keys)
        api_key = (req.api_key or fl_key).strip()
        base_url = _normalize_freellmapi_url(req.base_url or fl_url)
        test_model = (req.model or fl_model or "auto").strip()
    elif req.provider == "groq":
        groq_key, _ = _get_groq_key(keys)
        api_key = (req.api_key or groq_key).strip()
        base_url = ""
        test_model = (req.model or "").strip()
    else:
        base_url = ""
        test_model = ""
    if not api_key:
        return {"status": "error", "message": f"No API key configured for {req.provider}"}

    start_time = time.time()
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            if req.provider in ("openai", "groq", "freellmapi"):
                if req.provider == "openai":
                    test_model = req.model or "gpt-4.1-mini"
                    endpoint = "https://api.openai.com/v1/chat/completions"
                elif req.provider == "groq":
                    if not test_model:
                        m_res = await client.get(
                            "https://api.groq.com/openai/v1/models",
                            headers={"Authorization": f"Bearer {api_key}"},
                        )
                        if m_res.status_code != 200:
                            return {"status": "error", "message": _extract_provider_error(m_res.text, m_res.status_code)}
                        live_groq = _filter_groq_chat_models(m_res.json().get("data", []))
                        _GROQ_LIVE_MODELS.update(live_groq)
                        for pref in ("openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"):
                            if pref in live_groq:
                                test_model = pref
                                break
                        if not test_model:
                            test_model = live_groq[0] if live_groq else "openai/gpt-oss-20b"
                    endpoint = "https://api.groq.com/openai/v1/chat/completions"
                else:
                    endpoint = f"{base_url}/chat/completions"
                res = await client.post(
                    endpoint,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": test_model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 16}
                )
                latency = int((time.time() - start_time) * 1000)
                if res.status_code == 200:
                    routed_model = test_model
                    try:
                        routed_model = res.json().get("model") or test_model
                    except Exception:
                        pass
                    return {"status": "ok", "latency_ms": latency, "provider": req.provider, "model": routed_model}
                else:
                    return {"status": "error", "message": _extract_provider_error(res.text, res.status_code)}

            elif req.provider == "anthropic":
                test_model = req.model or "claude-haiku-4-20250414"
                res = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                    json={"model": test_model, "max_tokens": 5, "messages": [{"role": "user", "content": "ping"}]}
                )
                latency = int((time.time() - start_time) * 1000)
                if res.status_code == 200:
                    return {"status": "ok", "latency_ms": latency, "provider": "anthropic", "model": test_model}
                else:
                    return {"status": "error", "message": f"HTTP {res.status_code}: {res.text[:200]}"}

            elif req.provider == "gemini":
                test_model = req.model or "gemini-3.8-flash"
                errors: list[tuple[str, int, str]] = []
                key_id = _gemini_key_id(api_key)
                candidates = _gemini_endpoints(api_key, test_model, stream=False)
                for idx, (kind, endpoint_url) in enumerate(candidates):
                    res = await client.post(
                        endpoint_url,
                        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                        json={"contents": [{"role": "user", "parts": [{"text": "ping"}]}]}
                    )
                    if res.status_code == 200:
                        latency = int((time.time() - start_time) * 1000)
                        _remember_gemini_route(key_id, kind)
                        return {"status": "ok", "latency_ms": latency, "provider": "gemini", "model": test_model}
                    errors.append((kind, res.status_code, _extract_provider_error(res.text, res.status_code)))
                    if res.status_code in (400, 401, 403) and idx + 1 < len(candidates):
                        continue
                    break
                err_msg = _select_gemini_error(errors)
                logger.warning(f"Gemini key test failed ({test_model}): {err_msg}")
                return {"status": "error", "message": err_msg}

            else:
                return {"status": "error", "message": f"Unknown provider: {req.provider}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

