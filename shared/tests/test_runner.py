"""Local runner: access rules, token handling, GitHub proxy and the PTY socket.

Runs with pytest or `python -m unittest shared.tests.test_runner` (needs the
`runner` extra: aiohttp, plus pywinpty on Windows).
"""
import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestClient, TestServer

from shared.runner import origins_for
from shared.runner.pty_session import PtySession
from shared.runner.server import GITHUB_ROUTES, RunnerConfig, create_app, inject_token
from shared.runner.token_store import TokenStore

UI = "http://localhost:3000"
TOKEN = "ghp_test_token_123"


async def accept_token(http, token):
    return "octocat" if token == TOKEN else None


class RunnerTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.home = tempfile.TemporaryDirectory()
        self.store = TokenStore(home=Path(self.home.name), use_keyring=False)
        self.orchestrator_calls = []
        orchestrator = web.Application()

        async def record(request):
            body = await request.json() if request.can_read_body else None
            self.orchestrator_calls.append({"path": request.path, "query": dict(request.query), "body": body})
            return web.json_response({"ok": True})

        orchestrator.router.add_route("*", "/{tail:.*}", record)
        self.orchestrator = TestServer(orchestrator)
        await self.orchestrator.start_server()

        config = RunnerConfig(
            cwd=os.getcwd(),
            api_url=str(self.orchestrator.make_url("")),
            allowed_origins=origins_for(UI, []),
            shell=[sys.executable, "-q", "-i"],
        )
        self.client = TestClient(TestServer(create_app(config, self.store, verify_token=accept_token)))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        await self.orchestrator.close()
        self.home.cleanup()


class AccessTests(RunnerTestCase):
    async def test_status_without_github(self):
        res = await self.client.get("/status", headers={"Origin": UI})
        self.assertEqual(res.status, 200)
        data = await res.json()
        self.assertEqual(data["runner"], "archon")
        self.assertEqual(data["cwd"], os.getcwd())
        self.assertEqual(data["github"], {"connected": False, "login": None})
        self.assertEqual(res.headers["Access-Control-Allow-Origin"], UI)

    async def test_other_web_pages_are_refused(self):
        res = await self.client.get("/status", headers={"Origin": "https://evil.example"})
        self.assertEqual(res.status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", res.headers)

    async def test_dns_rebinding_host_is_refused(self):
        res = await self.client.get("/status", headers={"Host": "evil.example:7337"})
        self.assertEqual(res.status, 403)

    async def test_websocket_from_other_origin_is_refused(self):
        with self.assertRaises(Exception):
            await self.client.ws_connect("/pty", headers={"Origin": "https://evil.example"})

    async def test_preflight(self):
        res = await self.client.options("/github/token", headers={
            "Origin": UI, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Private-Network": "true"})
        self.assertEqual(res.status, 204)
        self.assertIn("PUT", res.headers["Access-Control-Allow-Methods"])
        self.assertEqual(res.headers["Access-Control-Allow-Private-Network"], "true")

    def test_origins_include_the_loopback_twin(self):
        self.assertEqual(origins_for("http://localhost:3000/", ["http://x:1/"]),
                         ["http://127.0.0.1:3000", "http://localhost:3000", "http://x:1"])


class TokenTests(RunnerTestCase):
    async def test_token_is_checked_kept_and_never_returned(self):
        res = await self.client.put("/github/token", json={"token": TOKEN}, headers={"Origin": UI})
        self.assertEqual(await res.json(), {"connected": True, "login": "octocat"})
        status = await (await self.client.get("/status")).text()
        self.assertIn('"login": "octocat"', status)
        self.assertNotIn(TOKEN, status)
        self.assertEqual(self.store.get(), (TOKEN, "octocat"))

    async def test_rejected_token_is_not_kept(self):
        res = await self.client.put("/github/token", json={"token": "ghp_wrong"}, headers={"Origin": UI})
        self.assertEqual(res.status, 400)
        self.assertEqual(self.store.get(), (None, None))

    async def test_empty_token_is_a_bad_request(self):
        res = await self.client.put("/github/token", json={}, headers={"Origin": UI})
        self.assertEqual(res.status, 400)

    async def test_delete_forgets_it(self):
        self.store.set(TOKEN, "octocat")
        res = await self.client.delete("/github/token", headers={"Origin": UI})
        self.assertEqual((await res.json())["connected"], False)
        self.assertEqual(self.store.get(), (None, None))

    def test_file_store_is_private(self):
        self.store.set(TOKEN, "octocat")
        if os.name == "posix":
            self.assertEqual(os.stat(Path(self.home.name) / "credentials.json").st_mode & 0o777, 0o600)
        self.assertEqual(TokenStore(home=Path(self.home.name), use_keyring=False).get(), (TOKEN, "octocat"))


class ProxyTests(RunnerTestCase):
    async def test_body_token_is_added(self):
        self.store.set(TOKEN, "octocat")
        res = await self.client.post("/proxy/api/github/open-repo", json={"repo_url": "a/b"}, headers={"Origin": UI})
        self.assertEqual(res.status, 200)
        self.assertEqual(self.orchestrator_calls[-1]["body"], {"repo_url": "a/b", "token": TOKEN})

    async def test_query_token_is_added(self):
        self.store.set(TOKEN, "octocat")
        await self.client.get("/proxy/api/github/file", params={"owner": "a", "repo": "b", "path": "x.py"})
        call = self.orchestrator_calls[-1]
        self.assertEqual(call["path"], "/api/github/file")
        self.assertEqual(call["query"]["token"], TOKEN)
        self.assertEqual(call["query"]["path"], "x.py")

    async def test_index_uses_github_token_field(self):
        self.store.set(TOKEN, "octocat")
        await self.client.post("/proxy/api/workspace/index-codebase", json={"is_github": True})
        self.assertEqual(self.orchestrator_calls[-1]["body"]["github_token"], TOKEN)

    async def test_no_token_stored_forwards_unchanged(self):
        await self.client.post("/proxy/api/github/open-repo", json={"repo_url": "a/b"})
        self.assertEqual(self.orchestrator_calls[-1]["body"], {"repo_url": "a/b"})

    async def test_only_github_calls_are_forwarded(self):
        self.store.set(TOKEN, "octocat")
        res = await self.client.post("/proxy/api/workspace/file", json={"path": "x"})
        self.assertEqual(res.status, 404)
        self.assertEqual(self.orchestrator_calls, [])

    def test_inject_token_covers_every_route(self):
        for route, (where, name) in GITHUB_ROUTES.items():
            query, body = inject_token(route, "t", {}, None)
            self.assertEqual((query if where == "query" else body)[name], "t", route)


class PtyTests(RunnerTestCase):
    async def read_until(self, ws, needle, timeout=20):
        seen = ""

        async def loop():
            nonlocal seen
            while needle not in seen:
                msg = await ws.receive()
                if msg.type == WSMsgType.BINARY:
                    seen += msg.data.decode("utf-8", "replace")
                elif msg.type == WSMsgType.TEXT:
                    seen += "\n" + msg.data + "\n"
                else:
                    raise AssertionError(f"socket closed before {needle!r}; got {seen[-300:]!r}")

        await asyncio.wait_for(loop(), timeout)
        return seen

    async def test_interactive_python_ctrl_c_and_exit(self):
        ws = await self.client.ws_connect("/pty?cols=100&rows=30", headers={"Origin": UI})
        ready = json.loads((await ws.receive()).data)
        self.assertEqual(ready["type"], "ready")
        await self.read_until(ws, ">>>")
        await ws.send_str(json.dumps({"type": "input", "data": "print(6 * 7)\r"}))
        await self.read_until(ws, "42")
        await ws.send_str(json.dumps({"type": "resize", "cols": 120, "rows": 40}))
        await ws.send_str(json.dumps({"type": "input", "data": "import time; time.sleep(30)\r"}))
        await asyncio.sleep(0.5)
        await ws.send_str(json.dumps({"type": "input", "data": "\x03"}))
        await self.read_until(ws, "KeyboardInterrupt")
        await ws.send_str(json.dumps({"type": "input", "data": "raise SystemExit(3)\r"}))
        out = await self.read_until(ws, '"type": "exit"')
        self.assertIn('"code": 3', out)
        await ws.close()

    async def test_closing_the_socket_ends_the_shell(self):
        spawned = []
        app = self.client.server.app
        ws = await self.client.ws_connect("/pty", headers={"Origin": UI})
        ready = json.loads((await ws.receive()).data)
        spawned.append(ready["pid"])
        await ws.close()
        await asyncio.sleep(1.5)
        if os.name == "posix":
            with self.assertRaises(ProcessLookupError):
                os.kill(spawned[0], 0)
        else:
            import ctypes
            handle = ctypes.windll.kernel32.OpenProcess(0x1000 | 0x00100000, False, spawned[0])  # QUERY_LIMITED | SYNCHRONIZE
            if handle:
                alive = ctypes.windll.kernel32.WaitForSingleObject(handle, 0) == 0x102  # WAIT_TIMEOUT
                ctypes.windll.kernel32.CloseHandle(handle)
                self.assertFalse(alive, "shell still running after the socket closed")
        self.assertIsNotNone(app)


class SessionTests(unittest.TestCase):
    def test_session_runs_in_the_given_folder(self):
        with tempfile.TemporaryDirectory() as d:
            s = PtySession([sys.executable, "-c", "import os; print('CWD=' + os.getcwd())"], d)
            out = b""
            while chunk := s.read():
                out += chunk
            s.wait()
            s.close()
            self.assertIn(os.path.realpath(d).lower(), os.path.realpath(out.decode().split("CWD=")[1].split()[0]).lower())


if __name__ == "__main__":
    unittest.main()
