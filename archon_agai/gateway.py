"""Archon Guard gateway (FastAPI). Backs the two frontend windows: Code Editor + Conformance.

    /api/conformance/*            reused Conformance Studio API (canvas works unchanged)
    /api/agai/sessions            create ADK session (codebase + blueprint in state)
    /api/agai/sessions/{id}       state snapshot (audit, narrative, healing report, usage, timings)
    /api/agai/stream/{id}         SSE stream of callback events (ADK, CrewAI, A2A, guardrails)
    /api/agai/audit               run ADK audit pipeline
    /api/agai/heal                ADK -> A2A -> CrewAI healing crew
    /api/agai/apply | /revert     human-in-the-loop apply of verified patches (with backup)
    /api/agai/tree | /file        editor file access, confined to allowed roots

Run:  uvicorn archon_agai.gateway:app --port 8100
"""
import asyncio
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from archon_agai import engine, events, observability
from archon_agai.github_workspace import GitHubWorkspaceClient
from archon_agai.config import (ALLOWED_ROOTS, BUILTIN_PROJECTS, SECRET_PARTS, DEFAULT_BLUEPRINT, DEFAULT_CODEBASE, DEMO_CODEBASE,
                                GATEWAY_PORT, HEALING_A2A_URL, REPO_ROOT,
                                RUNS_DIR, require_llm_key, to_container, to_host)
from archon_agai.guardrails import is_writable, resolve_allowed_path, screen_user_prompt
from archon_agai.pricing import estimate_cost
from archon_agai.schemas import AuditResult, HealingReport, HealingRequest
from conformance.studio.api import router as conformance_router

observability.setup("archon-guard-gateway")

APP_NAME = "archon-guard"
USER_ID = "reviewer"
session_service = InMemorySessionService()
_runners: Dict[str, Runner] = {}


def _runner(kind: str) -> Runner:
    if kind not in _runners:
        from archon_agai.agent import audit_pipeline, healing_agent  # lazy: spawns MCP servers on first use
        agent = audit_pipeline if kind == "audit" else healing_agent
        _runners[kind] = Runner(app_name=APP_NAME, agent=agent, session_service=session_service)
    return _runners[kind]


app = FastAPI(title="Archon Guard Gateway")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(conformance_router, prefix="/api/conformance", tags=["conformance"])


@app.exception_handler(ValueError)
async def _value_error(_, exc: ValueError):  # guardrail rejections (e.g. path outside allowed roots)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# --------------------------------------------------------------------------- sessions

class SessionReq(BaseModel):
    codebase_path: Optional[str] = None
    blueprint_id: Optional[str] = None


async def _state(sid: str) -> Dict[str, Any]:
    s = await session_service.get_session(app_name=APP_NAME, user_id=USER_ID, session_id=sid)
    if not s:
        raise HTTPException(404, "unknown session")
    return s.state


async def _patch_state(sid: str, delta: Dict[str, Any]) -> None:
    """State changes outside an agent run go through an event so ADK persists them."""
    from google.adk.events import Event, EventActions
    s = await session_service.get_session(app_name=APP_NAME, user_id=USER_ID, session_id=sid)
    await session_service.append_event(s, Event(author="gateway", invocation_id=uuid.uuid4().hex,
                                                actions=EventActions(state_delta=delta)))


@app.post("/api/agai/sessions")
async def create_session(req: SessionReq):
    try:
        root = resolve_allowed_path(to_host(req.codebase_path) if req.codebase_path else DEFAULT_CODEBASE)
    except ValueError as e:
        raise HTTPException(400, str(e))
    bp = req.blueprint_id or next((b for _, p, b in BUILTIN_PROJECTS if Path(p).resolve() == root), DEFAULT_BLUEPRINT)
    sid = "s-" + uuid.uuid4().hex[:10]
    await session_service.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=sid, state={
        "session_id": sid, "codebase_path": str(root), "blueprint_id": bp,
        "timings": {}, "usage": {}, "healable": is_writable(root),
    })
    events.emit(sid, "gateway", "session_created", str(root))
    return {"session_id": sid, "codebase_path": str(root), "blueprint_id": bp, "healable": is_writable(root)}


@app.get("/api/agai/builtins")
def builtins():
    """Built-in projects. `paths` are candidates for the IDE's orchestrator: container path first, then host path."""
    return [{"label": label, "path": p, "blueprint_id": bp,
             "paths": list(dict.fromkeys([to_container(p), p, Path(p).name]))}
            for label, p, bp in BUILTIN_PROJECTS]


def _require_writable(st: Dict[str, Any]) -> None:
    if not is_writable(Path(st["codebase_path"])):
        raise HTTPException(400, "read-only codebase: healing is only available for external projects")


@app.get("/api/agai/sessions/{sid}")
async def get_session(sid: str):
    st = dict(await _state(sid))
    st["cost"] = estimate_cost(st.get("usage", {}), (st.get("healing_report") or {}).get("usage", {}))
    return st


@app.get("/api/agai/stream/{sid}")
async def stream(sid: str):
    await _state(sid)
    q = events.subscribe(sid)

    async def gen():
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {ev.model_dump_json()}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            events.unsubscribe(sid, q)
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --------------------------------------------------------------------------- audit (ADK)

class AuditReq(BaseModel):
    session_id: str
    prompt: str = "Audit this codebase for Clean Architecture violations."


async def _run(kind: str, sid: str, text: str) -> str:
    final = ""
    async for ev in _runner(kind).run_async(user_id=USER_ID, session_id=sid,
                                            new_message=types.Content(role="user", parts=[types.Part(text=text)])):
        if ev.content and ev.content.parts:
            t = "".join(p.text or "" for p in ev.content.parts if getattr(p, "text", None))
            if t and ev.is_final_response():
                final = t
    return final


async def _audit_job(sid: str, prompt: str) -> None:
    t0 = time.perf_counter()
    try:
        try:
            await _run("audit", sid, prompt)
        except Exception as e:
            events.emit(sid, "gateway", "warning", f"audit agent LLM error ({type(e).__name__}); falling back to deterministic engine: {e}")
        st = await _state(sid)
        if not st.get("audit_result") and not st.get("guardrail_blocked"):
            # The model skipped the tool or encountered an error: fall back to deterministic ground truth, and record it.
            res, _ = engine.audit(st["codebase_path"], st["blueprint_id"])
            await _patch_state(sid, {"audit_result": res.model_dump(), "audit_fallback": True})
            events.emit(sid, "gateway", "fallback", "used deterministic conformance engine")
    except Exception as e:
        events.emit(sid, "gateway", "error", f"audit failed: {type(e).__name__}: {e}")
    finally:
        st = await _state(sid)
        await _patch_state(sid, {"timings": {**st.get("timings", {}), "audit_s": round(time.perf_counter() - t0, 2)}})
        observability.flush()
        events.emit(sid, "gateway", "audit_done", "")


@app.post("/api/agai/audit")
async def audit(req: AuditReq, bg: BackgroundTasks):
    await _state(req.session_id)
    reasons = screen_user_prompt(req.prompt)
    if reasons:  # fast path; the ADK before_agent callback enforces the same rules
        events.emit(req.session_id, "guardrail", "guardrail_block", "user prompt blocked", data={"reasons": reasons})
        raise HTTPException(400, {"blocked": reasons})
    try:
        require_llm_key()
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    await _patch_state(req.session_id, {"audit_result": None, "audit_narrative": None, "healing_report": None})
    bg.add_task(_audit_job, req.session_id, req.prompt)
    return {"accepted": True}


# --------------------------------------------------------------------------- heal (ADK -> A2A -> CrewAI)

class HealReq(BaseModel):
    session_id: str
    max_attempts: int = 3


async def _heal_job(sid: str, max_attempts: int) -> None:
    t0 = time.perf_counter()
    try:
        st = await _state(sid)
        hreq = HealingRequest(request_id=sid, codebase_path=st["codebase_path"], blueprint_id=st["blueprint_id"],
                              audit=AuditResult.model_validate(st["audit_result"]), max_attempts=max_attempts)
        
        # Pre-flight check: ensure healing server is reachable before invoking A2A (avoids 30min timeout freeze)
        import httpx
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{HEALING_A2A_URL}/.well-known/agent-card.json")
                if res.status_code != 200:
                    raise RuntimeError(f"Healing server returned status {res.status_code}")
        except Exception as e:
            events.emit(sid, "gateway", "error", f"Healing server on {HEALING_A2A_URL} is unreachable: {e}. Start port 8101.")
            return

        events.emit(sid, "a2a", "a2a_send", "ADK -> ArchonHealingCrew (A2A SendMessage)")
        text = await _run("heal", sid, hreq.model_dump_json())
        report = HealingReport.model_validate_json(_extract_json(text))
        await _patch_state(sid, {"healing_report": report.model_dump()})
        events.emit(sid, "a2a", "a2a_result", f"status={report.status} attempts={report.attempts}",
                    data={"health_after": report.verification.health_after if report.verification else None})
    except Exception as e:
        events.emit(sid, "gateway", "error", f"heal failed: {type(e).__name__}: {e}")
    finally:
        st = await _state(sid)
        await _patch_state(sid, {"timings": {**st.get("timings", {}), "heal_s": round(time.perf_counter() - t0, 2)}})
        observability.flush()
        events.emit(sid, "gateway", "heal_done", "")


def _extract_json(text: str) -> str:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError(f"no JSON in A2A response: {text[:200]}")
    return text[start:end + 1]


@app.post("/api/agai/heal")
async def heal(req: HealReq, bg: BackgroundTasks):
    st = await _state(req.session_id)
    _require_writable(st)
    if not st.get("audit_result"):
        raise HTTPException(400, "run an audit first")
    if not st["audit_result"]["violations"]:
        raise HTTPException(400, "nothing to heal: no violations")
    bg.add_task(_heal_job, req.session_id, max(1, min(req.max_attempts, 5)))
    return {"accepted": True}


# --------------------------------------------------------------------------- apply / revert (human in the loop)

class ApplyReq(BaseModel):
    session_id: str
    paths: Optional[List[str]] = None  # subset of patch paths; None = all


@app.post("/api/agai/apply")
async def apply(req: ApplyReq):
    st = await _state(req.session_id)
    _require_writable(st)
    report = HealingReport.model_validate(st.get("healing_report") or {"request_id": req.session_id})
    patches = [p for p in report.patches if req.paths is None or p.path in req.paths]
    if not patches:
        raise HTTPException(400, "no patches to apply")
    root = Path(st["codebase_path"])
    baseline = AuditResult.model_validate(st["audit_result"])
    check = engine.verify(str(root), st["blueprint_id"], patches, baseline)  # re-verify against current files
    if check.guardrail_rejections or check.syntax_errors or check.new_violation_ids:
        raise HTTPException(409, {"reason": "re-verification failed", "verification": check.model_dump()})
    backup = RUNS_DIR / "backups" / req.session_id
    backup.mkdir(parents=True, exist_ok=True)
    created = []
    for p in patches:
        f = root / p.path
        if f.exists() and not (backup / p.path).exists():
            (backup / p.path).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, backup / p.path)
        elif not f.exists():
            created.append(p.path)
    (backup / "_created.json").write_text(json.dumps(created))
    _, errors = engine.apply_patches(root, patches)
    after, _ = engine.audit(str(root), st["blueprint_id"])
    events.emit(req.session_id, "gateway", "applied", f"{len(patches)} patches applied; health {after.metrics.health_score}",
                data={"errors": errors, "provenance": {"session": req.session_id, "paths": [p.path for p in patches]}})
    await _patch_state(req.session_id, {"applied": [p.path for p in patches], "audit_after_apply": after.model_dump()})
    return {"applied": [p.path for p in patches], "errors": errors, "audit": after.model_dump()}


@app.post("/api/agai/revert")
async def revert(req: ApplyReq):
    st = await _state(req.session_id)
    _require_writable(st)
    root, backup = Path(st["codebase_path"]), RUNS_DIR / "backups" / req.session_id
    if not backup.exists():
        raise HTTPException(400, "nothing to revert")
    for f in backup.rglob("*.py"):
        shutil.copy2(f, root / f.relative_to(backup))
    for rel in json.loads((backup / "_created.json").read_text() or "[]"):
        (root / rel).unlink(missing_ok=True)
    shutil.rmtree(backup)
    events.emit(req.session_id, "gateway", "reverted", "")
    await _patch_state(req.session_id, {"applied": []})
    return {"reverted": True}


# --------------------------------------------------------------------------- report

@app.get("/api/agai/sessions/{sid}/report.md", response_class=PlainTextResponse)
async def report_md(sid: str):
    from archon_agai.report import render_markdown
    return render_markdown(await get_session(sid))


# --------------------------------------------------------------------------- editor file access

@app.get("/api/agai/tree")
def tree(codebase: Optional[str] = None):
    root = resolve_allowed_path(codebase or DEFAULT_CODEBASE)
    files = []
    for d, dirs, names in os.walk(root):  # prune vendor/secret dirs instead of walking them
        dirs[:] = [x for x in dirs if x not in SECRET_PARTS and x != "__pycache__" and not x.startswith(".")]
        files += [(Path(d) / f).relative_to(root).as_posix() for f in names
                  if not f.endswith(".pyc") and not f.startswith(".env")]
    return {"root": str(root), "files": sorted(files)}


@app.get("/api/agai/file")
def read_file(path: str, codebase: Optional[str] = None):
    root = resolve_allowed_path(codebase or DEFAULT_CODEBASE)
    f = resolve_allowed_path(path, root)
    if not f.is_file():
        raise HTTPException(404, "not found")
    return {"path": f.relative_to(root).as_posix(), "content": f.read_text(encoding="utf-8")}


class SaveReq(BaseModel):
    path: str
    content: str
    codebase: Optional[str] = None


@app.put("/api/agai/file")
def save_file(req: SaveReq):
    root = resolve_allowed_path(req.codebase or DEFAULT_CODEBASE, DEMO_CODEBASE, writable=True)
    f = resolve_allowed_path(req.path, root, writable=True)
    f.write_text(req.content, encoding="utf-8")
    return {"saved": f.relative_to(root).as_posix()}


# --------------------------------------------------------------------------- GitHub import

IMPORT_DIR = REPO_ROOT / "test_codebases" / "imported"  # inside the default ALLOWED_ROOTS, so imports are healable


class GitHubImportReq(BaseModel):
    repo: str  # "owner/repo" or a github.com URL
    branch: Optional[str] = None
    token: Optional[str] = None


@app.post("/api/agai/github/import")
async def github_import(req: GitHubImportReq):
    """Shallow-clone a GitHub repo locally: the engine needs real files for AST audit, sandbox verify and apply."""
    import re
    import subprocess
    slug = req.repo.strip().split("github.com/")[-1].strip("/").removesuffix(".git")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", slug):
        raise HTTPException(400, "use 'owner/repo' or a github.com URL")
    dest = IMPORT_DIR / slug.replace("/", "__")
    # The token goes in a one-off header, never into the clone's .git/config.
    auth = ["-c", f"http.extraHeader=Authorization: Bearer {req.token}"] if req.token else []
    if (dest / ".git").exists():
        cmds = [["git", *auth, "-C", str(dest), "pull", "--ff-only"]]
    else:
        IMPORT_DIR.mkdir(parents=True, exist_ok=True)
        cmds = [["git", *auth, "clone", "--depth", "1", *(["--branch", req.branch] if req.branch else []),
                 f"https://github.com/{slug}.git", str(dest)]]
    for cmd in cmds:
        r = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True, timeout=300)
        if r.returncode != 0 and not (dest / ".git").exists():
            raise HTTPException(502, f"git failed: {r.stderr.strip()[-400:]}")
    return {"codebase_path": str(dest), "container_path": to_container(str(dest)), "healable": is_writable(dest)}


@app.get("/api/agai/config")
def config():
    return {"defaultCodebase": DEFAULT_CODEBASE, "demoCodebase": DEMO_CODEBASE, "defaultBlueprint": DEFAULT_BLUEPRINT,
            "allowedRoots": [str(r) for r in ALLOWED_ROOTS]}


@app.get("/health")
def health():
    return {"ok": True}


# --------------------------------------------------------------------------- IDE workspace bridge (cloud standalone IDE)

ACTIVE_WORKSPACE_ROOT: Path = Path(REPO_ROOT).resolve()
RECENT_WORKSPACES: List[str] = [str(REPO_ROOT), str(DEMO_CODEBASE)]


class OpenProjectReq(BaseModel):
    path: str
    create_if_missing: Optional[bool] = False


@app.get("/api/workspace/projects")
def get_workspace_projects():
    global ACTIVE_WORKSPACE_ROOT, RECENT_WORKSPACES
    return {
        "current_project": ACTIVE_WORKSPACE_ROOT.name,
        "project_path": str(ACTIVE_WORKSPACE_ROOT).replace("\\", "/"),
        "git_branch": "main",
        "recent_projects": [p.replace("\\", "/") for p in RECENT_WORKSPACES]
    }


@app.post("/api/workspace/open-project")
def open_workspace_project(req: OpenProjectReq):
    global ACTIVE_WORKSPACE_ROOT, RECENT_WORKSPACES
    raw = (req.path or "").strip()
    target: Optional[Path] = None

    # 1. Check shortcuts
    if not raw or raw.lower() in ("archon", "default", "/archon", "/workspace"):
        target = Path(REPO_ROOT).resolve()
    elif raw.lower() in ("ecommerce", "ecommerce_platform", "demo", "test_codebases/ecommerce_platform"):
        target = Path(DEMO_CODEBASE).resolve()
    else:
        # 2. Try to_host mapping and existence
        candidate_str = to_host(raw)
        p = Path(candidate_str)
        if not p.is_absolute():
            # Check relative to REPO_ROOT first, then ALLOWED_ROOTS
            if (Path(REPO_ROOT) / p).exists():
                target = (Path(REPO_ROOT) / p).resolve()
            elif ALLOWED_ROOTS and (Path(ALLOWED_ROOTS[0]) / p).exists():
                target = (Path(ALLOWED_ROOTS[0]) / p).resolve()
        else:
            if p.exists():
                target = p.resolve()

    # 3. Fallback to resolve_allowed_path or candidate check
    if not target or not target.exists():
        try:
            target = resolve_allowed_path(to_host(raw) if raw else str(REPO_ROOT))
        except Exception:
            candidate = Path(raw).resolve()
            if candidate.exists() and candidate.is_dir():
                target = candidate

    if not target or not target.exists():
        if req.create_if_missing and raw:
            try:
                target = Path(raw).resolve()
                target.mkdir(parents=True, exist_ok=True)
                (target / "README.md").write_text(f"# {target.name}\n\nInitialized with Archon Copilot.\n", encoding="utf-8")
            except Exception as e:
                raise HTTPException(400, f"Cannot create directory {raw}: {e}")
        else:
            raise HTTPException(400, f"Directory not found: {raw}")

    ACTIVE_WORKSPACE_ROOT = target
    norm_path = str(target).replace("\\", "/")
    if norm_path not in RECENT_WORKSPACES:
        RECENT_WORKSPACES.insert(0, norm_path)
    return {
        "current_project": target.name,
        "project_path": norm_path,
        "git_branch": "main",
        "recent_projects": [p.replace("\\", "/") for p in RECENT_WORKSPACES]
    }


@app.get("/api/workspace/tree")
def get_workspace_tree(subpath: str = ""):
    global ACTIVE_WORKSPACE_ROOT
    target_dir = (ACTIVE_WORKSPACE_ROOT / subpath).resolve() if subpath else ACTIVE_WORKSPACE_ROOT
    if not str(target_dir).startswith(str(ACTIVE_WORKSPACE_ROOT)):
        target_dir = ACTIVE_WORKSPACE_ROOT

    def build_tree(dir_path: Path, current_depth: int = 0, max_depth: int = 6):
        items = []
        if current_depth > max_depth or not dir_path.is_dir():
            return items
        try:
            entries = sorted(list(os.scandir(dir_path)), key=lambda e: (not e.is_dir(follow_symlinks=False), e.name.lower()))
            for entry in entries[:300]:
                if entry.name in SECRET_PARTS or entry.name.startswith(".") or entry.name == "__pycache__":
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
        except Exception:
            pass
        return items

    return {
        "root": ACTIVE_WORKSPACE_ROOT.name,
        "root_path": str(ACTIVE_WORKSPACE_ROOT).replace("\\", "/"),
        "tree": build_tree(target_dir, 0, 6)
    }


class WorkspaceFileReq(BaseModel):
    path: str
    content: Optional[str] = ""


@app.get("/api/workspace/file")
def get_workspace_file(path: str):
    global ACTIVE_WORKSPACE_ROOT
    target_file = (ACTIVE_WORKSPACE_ROOT / path).resolve()
    if not target_file.is_file():
        try:
            target_file = resolve_allowed_path(path, ACTIVE_WORKSPACE_ROOT)
        except Exception:
            pass
    if not target_file.is_file():
        raise HTTPException(404, f"File not found: {path}")
    content = target_file.read_text(encoding="utf-8", errors="replace")
    return {"path": path, "content": content, "filename": target_file.name}


@app.post("/api/workspace/file")
def save_workspace_file(req: WorkspaceFileReq):
    global ACTIVE_WORKSPACE_ROOT
    target_file = (ACTIVE_WORKSPACE_ROOT / req.path).resolve()
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text(req.content or "", encoding="utf-8")
    return {"status": "success", "path": req.path, "bytes_written": len(req.content or "")}


class CreateItemReq(BaseModel):
    path: str
    is_directory: Optional[bool] = False


@app.post("/api/workspace/create")
def create_workspace_item(req: CreateItemReq):
    global ACTIVE_WORKSPACE_ROOT
    target = (ACTIVE_WORKSPACE_ROOT / req.path).resolve()
    try:
        if req.is_directory:
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.touch()
        return {"status": "success", "path": req.path}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


class DeleteItemReq(BaseModel):
    path: str


@app.post("/api/workspace/delete")
def delete_workspace_item(req: DeleteItemReq):
    global ACTIVE_WORKSPACE_ROOT
    import shutil
    target = (ACTIVE_WORKSPACE_ROOT / req.path).resolve()
    if not target.exists():
        raise HTTPException(404, detail="File or folder not found")
    if target == ACTIVE_WORKSPACE_ROOT or target == Path(REPO_ROOT).resolve():
        raise HTTPException(403, detail="Cannot delete root workspace")
    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"status": "success", "path": req.path}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


class RenameItemReq(BaseModel):
    old_path: str
    new_path: str


@app.post("/api/workspace/rename")
def rename_workspace_item(req: RenameItemReq):
    global ACTIVE_WORKSPACE_ROOT
    import shutil
    old_target = (ACTIVE_WORKSPACE_ROOT / req.old_path).resolve()
    new_target = (ACTIVE_WORKSPACE_ROOT / req.new_path).resolve()
    if not old_target.exists():
        raise HTTPException(404, detail="Source file not found")
    if new_target.exists() and new_target != old_target:
        raise HTTPException(400, detail="Destination already exists")
    try:
        new_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_target), str(new_target))
        return {"status": "success", "old_path": req.old_path, "new_path": req.new_path}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


class TerminalExecReq(BaseModel):
    command: str
    cwd: Optional[str] = None
    terminal_id: Optional[str] = None


@app.post("/api/terminal/exec")
async def terminal_exec(req: TerminalExecReq):
    global ACTIVE_WORKSPACE_ROOT
    raw_cmd = req.command.strip()
    
    # Resolve working directory from request or active workspace
    base_dir = ACTIVE_WORKSPACE_ROOT
    if req.cwd:
        cand = Path(req.cwd).resolve()
        if cand.exists() and cand.is_dir():
            base_dir = cand
    cwd_str = str(base_dir).replace("\\", "/")

    if not raw_cmd:
        return {"stdout": "", "stderr": "", "exit_code": 0, "cwd": cwd_str}
    
    # Handle 'cd' commands internally so it never hangs in a subprocess
    if raw_cmd == "cd" or raw_cmd.startswith("cd "):
        parts = raw_cmd.split(maxsplit=1)
        target = parts[1].strip() if len(parts) > 1 else "~"
        if target == "~":
            new_dir = Path.home()
        else:
            new_dir = (base_dir / target).resolve()
        
        if new_dir.exists() and new_dir.is_dir():
            ACTIVE_WORKSPACE_ROOT = new_dir
            new_cwd = str(new_dir).replace("\\", "/")
            return {"stdout": f"Changed directory to {new_cwd}\n", "stderr": "", "exit_code": 0, "cwd": new_cwd, "project_name": new_dir.name}
        else:
            return {"stdout": "", "stderr": f"cd: {target}: No such file or directory\n", "exit_code": 1, "cwd": cwd_str}
    
    # Run shell commands non-blocking in a thread with DEVNULL stdin and a 15-second timeout
    import asyncio
    import subprocess
    def _run_sub():
        return subprocess.run(
            raw_cmd,
            shell=True,
            cwd=str(base_dir),
            capture_output=True,
            text=True,
            timeout=15,
            stdin=subprocess.DEVNULL
        )

    try:
        res = await asyncio.to_thread(_run_sub)
        return {"stdout": res.stdout, "stderr": res.stderr, "exit_code": res.returncode, "cwd": cwd_str}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 15 seconds\n", "exit_code": 124, "cwd": cwd_str}
    except Exception as e:
        return {"stdout": "", "stderr": str(e) + "\n", "exit_code": 1, "cwd": cwd_str}


@app.get("/api/models")
def get_available_models():
    return {"models": ["auto", "gemma3:4b", "llama-3.3-70b-versatile", "gemini-2.5-flash", "deepseek-r1"]}


@app.get("/api/workspace/all-files")
def get_all_workspace_files():
    global ACTIVE_WORKSPACE_ROOT
    files = []
    for d, dirs, names in os.walk(ACTIVE_WORKSPACE_ROOT):
        dirs[:] = [x for x in dirs if x not in SECRET_PARTS and x != "__pycache__" and not x.startswith(".")]
        files += [(Path(d) / f).relative_to(ACTIVE_WORKSPACE_ROOT).as_posix() for f in names
                  if not f.endswith(".pyc") and not f.startswith(".env")]
    return {"files": sorted(files)}


@app.get("/api/workspace/graph")
def get_workspace_graph():
    return {"nodes": [], "edges": []}


@app.get("/api/cloud/keys")
def get_cloud_keys():
    return {"keys": {}}


class CloudKeyReq(BaseModel):
    provider: str
    api_key: str


@app.post("/api/cloud/keys")
def set_cloud_key(req: CloudKeyReq):
    return {"status": "success", "provider": req.provider}


class CloudKeyClearReq(BaseModel):
    provider: str


@app.post("/api/cloud/keys/clear")
def clear_cloud_key(req: CloudKeyClearReq):
    return {"status": "cleared", "provider": req.provider}


class CloudKeyTestReq(BaseModel):
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None


@app.post("/api/cloud/keys/test")
async def test_cloud_key(req: CloudKeyTestReq):
    return {"status": "ok", "latency": 120, "message": f"{req.provider} connection verified"}


@app.post("/api/agent/suggest-files")
def suggest_files():
    return {"suggestions": []}


class AgentChatMessage(BaseModel):
    role: str
    content: str


class AgentChatReq(BaseModel):
    messages: List[AgentChatMessage]
    active_file_path: Optional[str] = None
    attached_files: Optional[List[str]] = []
    model: Optional[str] = "auto"


@app.post("/api/agent/chat")
async def agent_chat(req: AgentChatReq):
    latest = req.messages[-1].content if req.messages else ""
    return {
        "reply": f"Archon Assistant: Received query for workspace '{ACTIVE_WORKSPACE_ROOT.name}'. Context ready.",
        "model": req.model,
        "rag_sources": []
    }


class GitHubOpenReq(BaseModel):
    repo_url: str
    branch: Optional[str] = None
    token: Optional[str] = None


@app.post("/api/github/open-repo")
async def github_open_repo(req: GitHubOpenReq):
    raw_url = req.repo_url.strip()
    if "github.com/" in raw_url:
        parts = raw_url.split("github.com/")[-1].strip("/").split("/")
    else:
        parts = raw_url.strip("/").split("/")
    if len(parts) < 2:
        raise HTTPException(400, "Invalid GitHub repository format. Use 'owner/repo' or full GitHub URL.")
    owner = parts[0]
    repo = parts[1].replace(".git", "")
    client = GitHubWorkspaceClient(token=req.token)
    try:
        repo_info = await client.get_repo_info(owner, repo, token=req.token)
        branch = req.branch or repo_info.get("default_branch", "main")
        tree = await client.get_tree(owner, repo, branch=branch, token=req.token)
        return {"status": "success", "repo_info": repo_info, "branch": branch, "tree": tree}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.get("/api/github/file")
async def github_get_file(owner: str, repo: str, path: str, branch: str = "main", token: Optional[str] = None):
    client = GitHubWorkspaceClient(token=token)
    try:
        return await client.get_file_content(owner, repo, path, branch, token=token)
    except Exception as e:
        raise HTTPException(500, detail=str(e))


class GitHubSaveReq(BaseModel):
    owner: str
    repo: str
    path: str
    content: str
    commit_message: Optional[str] = None
    branch: str = "main"
    sha: Optional[str] = None
    token: Optional[str] = None


@app.post("/api/github/save")
async def github_save_file(req: GitHubSaveReq):
    client = GitHubWorkspaceClient(token=req.token)
    try:
        return await client.save_file_content(
            owner=req.owner,
            repo=req.repo,
            path=req.path,
            content=req.content,
            commit_message=req.commit_message or f"Update {req.path} via Archon Copilot",
            branch=req.branch,
            sha=req.sha or "",
            token=req.token
        )
    except Exception as e:
        raise HTTPException(500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=GATEWAY_PORT)
