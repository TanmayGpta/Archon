"""In-process event bus: callbacks publish AgentEvents, the gateway streams them over SSE.

Every event is also appended to a JSONL audit log per session (provenance trail that
survives even if Langfuse is not configured).
"""
import asyncio
import json
import logging
import threading
from collections import defaultdict
from typing import Any, Dict, List, Optional

from archon_agai.config import RUNS_DIR
from archon_agai.schemas import AgentEvent

log = logging.getLogger("agai")
if not log.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")

_lock = threading.Lock()
_history: Dict[str, List[AgentEvent]] = defaultdict(list)
_subscribers: Dict[str, List[tuple]] = defaultdict(list)  # session -> [(loop, queue)]


def emit(session_id: str, framework: str, kind: str, message: str = "",
         agent: Optional[str] = None, data: Optional[Dict[str, Any]] = None) -> AgentEvent:
    ev = AgentEvent(session_id=session_id, framework=framework, kind=kind,
                    agent=agent, message=message, data=_jsonable(data or {}))
    level = logging.WARNING if kind in ("error", "guardrail_block") else logging.INFO
    log.log(level, "[%s] %s/%s %s %s", session_id, framework, kind, agent or "-", message)
    with _lock:
        _history[session_id].append(ev)
        subs = list(_subscribers[session_id])
    try:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        with open(RUNS_DIR / f"{session_id}.events.jsonl", "a", encoding="utf-8") as f:
            f.write(ev.model_dump_json() + "\n")
    except OSError:
        pass
    for loop, q in subs:  # thread-safe: CrewAI callbacks run in worker threads
        loop.call_soon_threadsafe(q.put_nowait, ev)
    return ev


def subscribe(session_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    with _lock:
        for ev in _history[session_id]:  # replay so late subscribers see the full flow
            q.put_nowait(ev)
        _subscribers[session_id].append((loop, q))
    return q


def unsubscribe(session_id: str, q: asyncio.Queue) -> None:
    with _lock:
        _subscribers[session_id] = [(l, x) for l, x in _subscribers[session_id] if x is not q]


def history(session_id: str) -> List[AgentEvent]:
    with _lock:
        return list(_history[session_id])


def _jsonable(d: Dict[str, Any]) -> Dict[str, Any]:
    try:
        json.dumps(d)
        return d
    except TypeError:
        return json.loads(json.dumps(d, default=str))
