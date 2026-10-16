"""Exposes the CrewAI healing flow as an A2A agent (JSON-RPC, a2a-sdk v1).

    GET  /.well-known/agent-card.json   agent card (capabilities, skill, endpoint)
    POST /                              JSON-RPC: SendMessage with a HealingRequest JSON text part

Run:  python -m archon_agai.healing.a2a_server
"""
import asyncio
import json

import uvicorn
from a2a.helpers.proto_helpers import new_text_message
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill
from starlette.applications import Starlette

from archon_agai import observability
from archon_agai.config import HEALING_A2A_URL, HEALING_PORT
from archon_agai.events import emit
from archon_agai.healing.crew import run_healing
from archon_agai.schemas import HealingReport, HealingRequest

AGENT_CARD = AgentCard(
    name="ArchonHealingCrew",
    description=("CrewAI team (Chief Architect, Refactoring Specialist, Conformance Verifier) that turns "
                 "Clean Architecture violations into verified Dependency Inversion patches."),
    version="1.0.0",
    supported_interfaces=[AgentInterface(url=HEALING_A2A_URL + "/", protocol_binding="JSONRPC")],
    capabilities=AgentCapabilities(streaming=False),
    default_input_modes=["application/json", "text/plain"],
    default_output_modes=["application/json"],
    skills=[AgentSkill(
        id="heal_architecture",
        name="Heal architecture violations",
        description="Input: HealingRequest JSON (audit result + codebase). Output: HealingReport JSON with "
                    "patches and deterministic verification.",
        tags=["architecture", "refactoring", "clean-architecture", "dependency-inversion"],
    )],
)


class HealingExecutor(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        text = context.get_user_input()
        # ADK may forward earlier session turns as context; the request is the last HealingRequest JSON.
        start = text.rfind('{"request_id"')
        try:
            obj, _ = json.JSONDecoder().raw_decode(text, max(start, 0))
            req = HealingRequest.model_validate(obj)
        except Exception as e:
            await event_queue.enqueue_event(new_text_message(
                HealingReport(request_id="invalid", status="failed",
                              summary_markdown=f"Invalid HealingRequest: {e}").model_dump_json(),
                context_id=context.context_id, task_id=context.task_id))
            return
        sid = req.request_id
        emit(sid, "a2a", "a2a_received", "HealingRequest received by ArchonHealingCrew",
             data={"violations": len(req.audit.violations)})
        report = await asyncio.to_thread(run_healing, req, sid)
        emit(sid, "a2a", "a2a_responded", f"HealingReport status={report.status}")
        await event_queue.enqueue_event(new_text_message(
            report.model_dump_json(), context_id=context.context_id, task_id=context.task_id))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError("cancel not supported")


def build_app() -> Starlette:
    observability.setup("archon-healing-crew")
    handler = DefaultRequestHandler(agent_executor=HealingExecutor(), task_store=InMemoryTaskStore(),
                                    agent_card=AGENT_CARD)
    app = Starlette()
    app.routes.extend([*create_agent_card_routes(AGENT_CARD),
                       *create_jsonrpc_routes(handler, rpc_url="/", enable_v0_3_compat=True)])
    return app


app = build_app()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=HEALING_PORT)
