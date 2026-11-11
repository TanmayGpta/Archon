"""Generation jobs: events are kept so a page can re-attach and replay what it missed."""

import asyncio
import json
import time
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app import jobs
from app.main import app


def _drain(job, start=0):
    async def go():
        return [json.loads(line[6:]) async for line in jobs.follow(job, start)]
    return asyncio.run(go())


def test_follow_replays_from_offset_and_stops_at_terminal_event():
    job = jobs.create("jury")
    for i in range(3):
        job.emit({"type": "stage", "message": f"s{i}"})
    job.emit({"type": "complete", "result": {}})
    job.emit({"type": "stage", "message": "ignored after completion"})

    events = _drain(job)
    assert [e["seq"] for e in events] == [0, 1, 2, 3] and events[-1]["type"] == "complete"
    resumed = _drain(job, start=2)
    assert [e["seq"] for e in resumed] == [2, 3]


def test_unknown_job_is_404():
    api = TestClient(app)
    assert api.get("/api/arcgen/jobs/nope").status_code == 404
    assert api.get("/api/arcgen/jobs/nope/stream").status_code == 404


def test_missing_input_fails_before_a_job_starts():
    with patch("app.router.get_llm_client", return_value=MagicMock()):
        r = TestClient(app).post("/api/arcgen/jobs", json={"jury": False})
    assert r.status_code == 400


def test_plain_job_runs_without_a_listener_and_can_be_replayed():
    graph = MagicMock(project_name="P", style="layered", nodes=[], edges=[], plantuml="@startuml\n@enduml")
    graph.to_mermaid.return_value = "graph TD"
    report = MagicMock()
    report.model_dump.return_value = {"ok": True}
    with patch("app.router.get_llm_client", return_value=MagicMock()), \
         patch("app.router.normalize_srs", return_value=MagicMock(project_name="P")), \
         patch("app.router.generate_architecture_from_srs", return_value=(graph, "table", report, None)):
        api = TestClient(app)
        info = api.post("/api/arcgen/jobs", json={"srs_text": "The system shall...", "jury": False}).json()
        job_id = info["job_id"]
        for _ in range(100):  # nobody is listening; the job still finishes
            if api.get(f"/api/arcgen/jobs/{job_id}").json()["done"]:
                break
            time.sleep(0.05)

    body = api.get(f"/api/arcgen/jobs/{job_id}/stream").text
    events = [json.loads(l[6:]) for l in body.split("\n") if l.startswith("data: ")]
    assert events[-1]["type"] == "complete"
    assert events[-1]["result"]["style"] == "layered"
