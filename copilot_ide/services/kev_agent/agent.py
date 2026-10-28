"""Kev GPU agent: one-click control of the college-GPU Kev server for Conformance Studio.

Runs on the Docker host network (compose profile "gpu") because it needs the user's SSH key and
must expose the tunnel to the other containers:
  - keeps an ssh tunnel  AGENT_BIND:8009 -> head node 127.0.0.1:8009 (KEV_URL for the orchestrator)
  - GET  /status   pod / server / tunnel state, refreshed at most every STATUS_TTL seconds
  - POST /start    sync kev_serve.sh + pod.yaml to the head node, then `kev_serve.sh start L3`
  - POST /stop     `kev_serve.sh stop` (deletes the pod, frees the GPU slice)
The key is read from /keys/id_ed25519 into a private ssh-agent (memory only).
Stdlib only.
"""
import json
import os
import subprocess
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ["CLF_HOST"]                      # user@head-node
BIND = os.getenv("AGENT_BIND", "172.17.0.1")       # docker bridge: host.docker.internal for containers
PORT = int(os.getenv("AGENT_PORT", "7338"))
KEYS = os.getenv("KEYS_DIR", "/keys")
GPU = os.getenv("GPU_SCRIPTS", "/gpu")             # experiments/classifier_eval/gpu (kev_serve.sh, pod.yaml)
STATUS_TTL = 10
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
       "-o", f"UserKnownHostsFile={KEYS}/known_hosts"]

state = {"busy": False, "log": [], "error": "", "remote": {}, "checked": 0.0, "tunnel": False}
lock = threading.Lock()


def log(line: str):
    print(line, flush=True)
    with lock:
        state["log"] = (state["log"] + [f"{time.strftime('%H:%M:%S')} {line}"])[-30:]


def start_ssh_agent():
    out = subprocess.run(["ssh-agent", "-s"], capture_output=True, text=True, check=True).stdout
    for part in out.replace("\n", ";").split(";"):
        if "=" in part and part.strip().startswith("SSH_"):
            k, v = part.strip().split("=", 1)
            os.environ[k] = v
    with open(f"{KEYS}/id_ed25519", "rb") as key:
        subprocess.run(["ssh-add", "-"], stdin=key, capture_output=True, check=True)


def remote(cmd: str, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(SSH + [HOST, cmd], capture_output=True, text=True, timeout=timeout)


def kev_reachable() -> bool:
    try:
        with urllib.request.urlopen(f"http://{BIND}:8009/v1/models", timeout=4) as r:
            return r.status == 200
    except Exception:
        return False


def tunnel_loop():
    while True:
        proc = subprocess.Popen(SSH + ["-N", "-o", "ExitOnForwardFailure=yes",
                                       "-L", f"{BIND}:8009:127.0.0.1:8009", HOST])
        with lock:
            state["tunnel"] = True
        proc.wait()
        with lock:
            state["tunnel"] = False
        log(f"tunnel dropped (exit {proc.returncode}), reconnecting")
        time.sleep(5)


def refresh(force: bool = False):
    if not force and time.time() - state["checked"] < STATUS_TTL:
        return
    try:
        out = remote("bash -l ~/archon_clf/kev_serve.sh status", timeout=40).stdout.strip().splitlines()
        fields = dict(kv.split("=", 1) for kv in (out[-1].split() if out else []) if "=" in kv)
        with lock:
            state["remote"], state["error"] = fields, ""
    except Exception as e:
        with lock:
            state["error"] = f"head node unreachable: {e}"
    state["checked"] = time.time()


def phase(reachable: bool) -> str:
    r = state["remote"]
    if reachable:
        return "ready"
    if r.get("server") == "ready":
        return "connecting"
    if r.get("server") == "loading":
        return "loading model"
    if r.get("pod") in ("Pending", "ContainerCreating"):
        return "pod starting"
    return "starting" if state["busy"] else "off"


def sync_scripts():
    """Head node gets this repo's kev_serve.sh + pod.yaml, so `status` / `start` match this agent."""
    subprocess.run(["scp", "-q"] + SSH[1:] + [f"{GPU}/kev_serve.sh", f"{GPU}/pod.yaml", f"{HOST}:archon_clf/"],
                   capture_output=True, text=True, timeout=60, check=True)


def run_start():
    try:
        log("syncing kev_serve.sh + pod.yaml to the head node")
        sync_scripts()
        log("creating pod / launching Kev (fresh pods download the 18 GB base model)")
        res = remote("bash -l ~/archon_clf/kev_serve.sh start L3", timeout=900)
        for line in (res.stdout + res.stderr).strip().splitlines()[-6:]:
            log(line)
        if res.returncode:
            state["error"] = f"start failed (exit {res.returncode})"
    except Exception as e:
        state["error"] = f"start failed: {e}"
        log(state["error"])
    finally:
        state["busy"] = False
        refresh(force=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def status(self) -> dict:
        refresh()
        reachable = kev_reachable()
        with lock:
            return {"agent": True, "phase": phase(reachable), "reachable": reachable, "tunnel": state["tunnel"],
                    "busy": state["busy"], "error": state["error"], "remote": state["remote"], "log": state["log"][-8:]}

    def do_GET(self):
        if self.path == "/status":
            return self._send(200, self.status())
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/start":
            if not state["busy"]:
                state["busy"], state["error"] = True, ""
                threading.Thread(target=run_start, daemon=True).start()
            return self._send(202, self.status())
        if self.path == "/stop":
            res = remote("bash -l ~/archon_clf/kev_serve.sh stop", timeout=60)
            log("stop: " + (res.stdout + res.stderr).strip()[-200:])
            refresh(force=True)
            return self._send(200, self.status())
        self._send(404, {"error": "not found"})

    def log_message(self, *args):   # keep container logs to our own lines
        pass


if __name__ == "__main__":
    start_ssh_agent()
    try:
        sync_scripts()
    except Exception as e:
        log(f"script sync failed (head node unreachable?): {e}")
    threading.Thread(target=tunnel_loop, daemon=True).start()
    log(f"kev-agent on {BIND}:{PORT}, tunnel {BIND}:8009 -> {HOST}")
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
