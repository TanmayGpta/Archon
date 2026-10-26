"""
The local Archon runner: a small HTTP + WebSocket server on 127.0.0.1 that
gives the browser IDE what a container cannot.

  GET    /status                 who is running, where, and whether GitHub is connected
  GET    /pty  (WebSocket)       a real shell on this machine
  PUT    /github/token           validate and keep a GitHub token (the browser never reads it back)
  DELETE /github/token           forget it
  *      /proxy/<api path>       forward one of the orchestrator's GitHub calls with the token added

Anything on the user's machine can reach a localhost port, and any web page
can try. So the server only listens on loopback, refuses Host headers other
than localhost (DNS rebinding) and refuses browser Origins other than the
IDE's. The orchestrator URL is fixed at launch: a page cannot point the proxy,
and so the token, somewhere else.
"""
import asyncio
import json
import os
import sys
import threading
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlsplit

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

from .pty_session import PtySession, default_shell
from .token_store import TokenStore

VERSION = "1"
DEFAULT_PORT = 7337
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
HTTP = web.AppKey("http", ClientSession)

# Orchestrator calls that take a GitHub token, and where it goes. Mirrors
# copilot_ide/frontend/src/lib/github.ts; nothing else is proxied.
GITHUB_ROUTES: Dict[str, Tuple[str, str]] = {
    "api/github/open-repo": ("body", "token"),
    "api/github/file": ("query", "token"),
    "api/github/save": ("body", "token"),
    "api/github/fork": ("body", "token"),
    "api/workspace/index-codebase": ("body", "github_token"),
}

Spawn = Callable[[List[str], str, int, int], PtySession]
VerifyToken = Callable[[ClientSession, str], Awaitable[Optional[str]]]


@dataclass
class RunnerConfig:
    cwd: str
    api_url: str = "http://localhost:8000"
    allowed_origins: List[str] = field(default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"])
    shell: List[str] = field(default_factory=default_shell)


async def github_login(http: ClientSession, token: str) -> Optional[str]:
    """The account a token belongs to, or None if GitHub rejects it."""
    async with http.get(
        "https://api.github.com/user",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    ) as res:
        if res.status in (401, 403):
            return None
        res.raise_for_status()
        return (await res.json()).get("login")


def inject_token(route: str, token: str, query: Dict[str, str], body: Optional[dict]) -> Tuple[Dict[str, str], Optional[dict]]:
    where, name = GITHUB_ROUTES[route]
    if where == "query":
        return {**query, name: token}, body
    return query, {**(body or {}), name: token}


def _origin_allowed(request: web.Request, allowed: List[str]) -> bool:
    origin = request.headers.get("Origin")
    # Browsers always send Origin for WebSockets and cross-origin fetches; tools like curl don't
    return origin is None or origin in allowed


def _host_allowed(request: web.Request) -> bool:
    host = urlsplit(f"//{request.host}").hostname or ""
    return host in LOOPBACK_HOSTS


def create_app(
    config: RunnerConfig,
    store: Optional[TokenStore] = None,
    spawn: Optional[Spawn] = None,
    verify_token: VerifyToken = github_login,
) -> web.Application:
    store = store or TokenStore()
    spawn = spawn or (lambda argv, cwd, cols, rows: PtySession(argv, cwd, cols, rows))

    def cors(request: web.Request, response: web.StreamResponse) -> web.StreamResponse:
        origin = request.headers.get("Origin")
        if origin in config.allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response

    @web.middleware
    async def guard(request: web.Request, handler):
        if not _host_allowed(request):
            return web.json_response({"detail": "The runner only answers on localhost."}, status=403)
        if not _origin_allowed(request, config.allowed_origins):
            return web.json_response({"detail": f"Origin {request.headers.get('Origin')} is not allowed."}, status=403)
        if request.method == "OPTIONS":
            response = web.Response(status=204)
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            if request.headers.get("Access-Control-Request-Private-Network"):
                response.headers["Access-Control-Allow-Private-Network"] = "true"
            return cors(request, response)
        response = await handler(request)
        return response if isinstance(response, web.WebSocketResponse) else cors(request, response)

    app = web.Application(middlewares=[guard])

    async def open_http(app: web.Application):
        app[HTTP] = ClientSession(timeout=ClientTimeout(total=600))
        yield
        await app[HTTP].close()

    app.cleanup_ctx.append(open_http)

    async def status(request: web.Request) -> web.Response:
        token, login = store.get()
        return web.json_response({
            "runner": "archon",
            "version": VERSION,
            "cwd": config.cwd,
            "shell": os.path.basename(config.shell[0]).removesuffix(".exe"),
            "platform": sys.platform,
            "api_url": config.api_url,
            "github": {"connected": bool(token), "login": login},
        })

    async def put_token(request: web.Request) -> web.Response:
        try:
            token = str((await request.json()).get("token", "")).strip()
        except ValueError:
            token = ""
        if not token:
            return web.json_response({"detail": "Send {\"token\": \"ghp_...\"}."}, status=400)
        try:
            login = await verify_token(request.app[HTTP], token)
        except Exception as e:
            return web.json_response({"detail": f"Could not reach GitHub to check the token: {e}"}, status=502)
        if not login:
            return web.json_response({"detail": "GitHub rejected this token."}, status=400)
        store.set(token, login)
        return web.json_response({"connected": True, "login": login})

    async def delete_token(request: web.Request) -> web.Response:
        store.clear()
        return web.json_response({"connected": False, "login": None})

    async def proxy(request: web.Request) -> web.Response:
        route = request.match_info["path"].strip("/")
        if route not in GITHUB_ROUTES:
            return web.json_response({"detail": f"/{route} is not a GitHub call the runner forwards."}, status=404)
        query = dict(request.query)
        body = None
        if request.can_read_body:
            try:
                body = await request.json()
            except ValueError:
                return web.json_response({"detail": "Expected a JSON body."}, status=400)
        token, _ = store.get()
        if token:
            query, body = inject_token(route, token, query, body)
        try:
            async with request.app[HTTP].request(
                request.method, f"{config.api_url.rstrip('/')}/{route}", params=query, json=body
            ) as res:
                return web.Response(status=res.status, body=await res.read(), content_type=res.content_type)
        except Exception as e:
            return web.json_response({"detail": f"Could not reach the orchestrator at {config.api_url}: {e}"}, status=502)

    async def pty_socket(request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)
        cols = _int(request.query.get("cols"), 80)
        rows = _int(request.query.get("rows"), 24)
        try:
            session = spawn(config.shell, config.cwd, cols, rows)
        except Exception as e:
            await ws.send_json({"type": "error", "message": f"Could not start {config.shell[0]}: {e}"})
            await ws.close()
            return ws

        loop = asyncio.get_running_loop()
        output: asyncio.Queue = asyncio.Queue()

        def read_loop():  # a thread per shell: reads block until there is output
            while True:
                data = session.read()
                loop.call_soon_threadsafe(output.put_nowait, data)
                if not data:
                    loop.call_soon_threadsafe(output.put_nowait, ("exit", session.wait()))
                    return

        threading.Thread(target=read_loop, daemon=True, name=f"pty-{session.pid}").start()

        async def forward():
            while True:
                item = await output.get()
                if isinstance(item, tuple):
                    await ws.send_json({"type": "exit", "code": item[1]})
                    await ws.close()
                    return
                if item:
                    await ws.send_bytes(item)

        await ws.send_json({"type": "ready", "shell": os.path.basename(config.shell[0]).removesuffix(".exe"), "cwd": config.cwd, "pid": session.pid})
        forwarding = asyncio.create_task(forward())
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    m = json.loads(msg.data)
                except ValueError:
                    continue
                if m.get("type") == "input" and isinstance(m.get("data"), str):
                    session.write(m["data"])
                elif m.get("type") == "resize":
                    session.resize(_int(m.get("cols"), cols), _int(m.get("rows"), rows))
        finally:
            session.close()
            try:
                await asyncio.wait_for(forwarding, timeout=2)
            except (asyncio.TimeoutError, Exception):
                forwarding.cancel()
        return ws

    app.router.add_get("/status", status)
    app.router.add_put("/github/token", put_token)
    app.router.add_delete("/github/token", delete_token)
    app.router.add_route("*", "/proxy/{path:.+}", proxy)
    app.router.add_get("/pty", pty_socket)
    return app


def _int(value, fallback: int) -> int:
    try:
        return max(1, min(int(value), 1000))
    except (TypeError, ValueError):
        return fallback
