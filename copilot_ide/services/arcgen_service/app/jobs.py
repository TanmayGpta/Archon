"""Generation jobs that outlive the browser connection.

A job runs in a worker thread and appends every event to its own log. Any number of clients can
follow it from any offset, so a page that was unmounted (studio tab switch), reloaded, or put to
sleep by the browser re-attaches and replays what it missed. In-memory only: a service restart
forgets jobs, and the UI reports that.
"""

import asyncio
import json
import threading
import time
import uuid
from typing import AsyncIterator, Dict, List, Optional

MAX_JOBS = 20                 # oldest finished jobs are dropped beyond this
FINISHED_TTL_S = 2 * 3600     # finished jobs are kept this long for late re-attach
POLL_S = 0.25
TERMINAL = {"complete", "error"}


class Job:
    def __init__(self, kind: str):
        self.id = uuid.uuid4().hex[:12]
        self.kind = kind
        self.events: List[dict] = []
        self.done = False
        self.created = time.time()
        self.finished: Optional[float] = None
        self._lock = threading.Lock()

    def emit(self, event: dict) -> None:
        with self._lock:
            if self.done:
                return
            self.events.append(event)
            if event.get("type") in TERMINAL:
                self.done, self.finished = True, time.time()

    def snapshot(self, start: int):
        with self._lock:
            return self.events[start:], self.done, len(self.events)

    def info(self) -> dict:
        with self._lock:
            return {"job_id": self.id, "kind": self.kind, "done": self.done, "events": len(self.events),
                    "created": self.created, "finished": self.finished}


_jobs: Dict[str, Job] = {}
_jobs_lock = threading.Lock()


def _prune() -> None:
    now = time.time()
    for jid, job in list(_jobs.items()):
        if job.done and job.finished and now - job.finished > FINISHED_TTL_S:
            del _jobs[jid]
    finished = sorted((j for j in _jobs.values() if j.done), key=lambda j: j.finished or 0)
    while len(_jobs) > MAX_JOBS and finished:
        del _jobs[finished.pop(0).id]


def create(kind: str) -> Job:
    job = Job(kind)
    with _jobs_lock:
        _prune()
        _jobs[job.id] = job
    return job


def get(job_id: str) -> Optional[Job]:
    with _jobs_lock:
        return _jobs.get(job_id)


async def follow(job: Job, start: int = 0) -> AsyncIterator[str]:
    """SSE lines for events[start:], then live ones until the job finishes.

    Each event carries "seq" (its index) so a client can resume from seq + 1.
    """
    idx = max(0, start)
    while True:
        new, done, total = job.snapshot(idx)
        for i, event in enumerate(new, idx):
            yield f"data: {json.dumps({**event, 'seq': i}, default=str)}\n\n"
        idx = total
        if done:
            return
        await asyncio.sleep(POLL_S)
