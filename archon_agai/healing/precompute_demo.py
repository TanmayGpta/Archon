"""Precompute the healing plan + patches for the bundled e-commerce demo, so a live demo heals in seconds.

The patches are hand-written Dependency Inversion fixes, checked with the real sandbox verification (engine.verify)
before being saved to demo_cache.json. Re-run after changing the demo codebase or the audit:

    python -m archon_agai.healing.precompute_demo
"""
import sys

from archon_agai import engine
from archon_agai.config import DEMO_CODEBASE
from archon_agai.healing.crew import _demo_key, _save_demo
from archon_agai.schemas import FilePatch, HealingPlan, HealingRequest, PortDesign, SearchReplace

BLUEPRINT = "clean_architecture"

PORTS = '''"""Ports owned by the domain; outer layers provide the implementations."""
from typing import Any, Protocol


class QueryPort(Protocol):
    def query(self, sql: str, *args: Any) -> Any: ...


class ErrorReporter(Protocol):
    def format_error(self, message: str) -> Any: ...
'''

ORDER_QUERIES = '''from domain.ports import QueryPort


class OrderQueryService:
    """Read-side use case: presentation asks this instead of running SQL itself."""

    def __init__(self, db: QueryPort):
        self.db = db

    def get_order_details(self, order_id: str):
        return self.db.query("SELECT * FROM orders WHERE id = %s", order_id)
'''


def _edit(search: str, replace: str) -> SearchReplace:
    return SearchReplace(search=search, replace=replace)


PATCHES = [
    FilePatch(path="domain/ports.py", operation="create", content=PORTS,
              violation_ids=["domain.fraud_checker->infrastructure.database",
                             "domain.payment_rule->presentation.controllers"],
              rationale="Domain-owned interfaces for data queries and error reporting"),
    FilePatch(path="domain/fraud_checker.py", violation_ids=["domain.fraud_checker->infrastructure.database"],
              rationale="Inject a QueryPort instead of constructing the infrastructure DatabaseConnection",
              edits=[_edit("from infrastructure.database import DatabaseConnection  # VIOLATION: Domain -> Infrastructure",
                           "from domain.ports import QueryPort"),
                     _edit("    def __init__(self):\n        self.db = DatabaseConnection()",
                           "    def __init__(self, db: QueryPort):\n        self.db = db")]),
    FilePatch(path="domain/payment_rule.py", violation_ids=["domain.payment_rule->presentation.controllers"],
              rationale="Inject an optional ErrorReporter instead of importing the presentation formatter",
              edits=[_edit("from presentation.controllers import ResponseFormatter  # VIOLATION: Domain -> Presentation",
                           "from typing import Optional\n\nfrom domain.ports import ErrorReporter"),
                     _edit("class PaymentRuleValidator:\n",
                           "class PaymentRuleValidator:\n"
                           "    def __init__(self, errors: Optional[ErrorReporter] = None):\n"
                           "        self.errors = errors\n\n"),
                     _edit("            ResponseFormatter.format_error(\"Amount must be positive\")",
                           "            if self.errors:\n"
                           "                self.errors.format_error(\"Amount must be positive\")")]),
    FilePatch(path="infrastructure/audit_logger.py",
              violation_ids=["infrastructure.audit_logger->presentation.auth_middleware"],
              rationale="Receive the current-user provider by injection instead of importing presentation auth",
              edits=[_edit("from presentation.auth_middleware import get_current_user_context  # VIOLATION: Infrastructure -> Presentation",
                           "from typing import Any, Callable, Optional"),
                     _edit("class AuditLogger:\n    @staticmethod\n    def log_action(action: str):\n"
                           "        # Infrastructure reaches into presentation auth token context\n"
                           "        user = get_current_user_context()",
                           "class AuditLogger:\n    user_context: Optional[Callable[[], Any]] = None  # wired by the composition root\n\n"
                           "    @staticmethod\n    def log_action(action: str, user_context: Optional[Callable[[], Any]] = None):\n"
                           "        provider = user_context or AuditLogger.user_context\n"
                           "        user = provider() if provider else \"unknown\"")]),
    FilePatch(path="application/order_queries.py", operation="create", content=ORDER_QUERIES,
              violation_ids=["presentation.order_routes->infrastructure.database"],
              rationale="Application use case for reading an order, backed by the QueryPort"),
    FilePatch(path="presentation/order_routes.py", violation_ids=["presentation.order_routes->infrastructure.database"],
              rationale="Route asks the application layer (wired on app.state) instead of running SQL",
              edits=[_edit("from fastapi import APIRouter\n", "from fastapi import APIRouter, Request\n"),
                     _edit("from infrastructure.database import DatabaseConnection  # VIOLATION: Presentation -> Infrastructure (Bypasses Use-Case)\n", ""),
                     _edit("def get_order_details(order_id: str):\n"
                           "    # Presentation directly running SQL on Infrastructure instead of asking Application layer\n"
                           "    db = DatabaseConnection()\n"
                           "    data = db.query(\"SELECT * FROM orders WHERE id = %s\", order_id)",
                           "def get_order_details(order_id: str, request: Request):\n"
                           "    data = request.app.state.order_queries.get_order_details(order_id)")]),
    FilePatch(path="main.py", violation_ids=["presentation.order_routes->infrastructure.database"],
              rationale="Composition root wires the database adapter into the order query use case",
              edits=[_edit("from application.order_service import OrderService\n"
                           "from infrastructure.database import init_db\n",
                           "from application.order_service import OrderService\n"
                           "from application.order_queries import OrderQueryService\n"
                           "from infrastructure.database import DatabaseConnection, init_db\n\n"
                           "app.state.order_queries = OrderQueryService(DatabaseConnection())\n")]),
]

PLAN = HealingPlan(notes="Precomputed for the bundled demo; main.py stays the composition root.", ports=[
    PortDesign(port_name="QueryPort", port_module="domain/ports.py", adapter_module="infrastructure/database.py",
               methods=["query(sql, *args)"],
               resolves=["domain.fraud_checker->infrastructure.database",
                         "presentation.order_routes->infrastructure.database"]),
    PortDesign(port_name="ErrorReporter", port_module="domain/ports.py", adapter_module="presentation/controllers.py",
               methods=["format_error(message)"], resolves=["domain.payment_rule->presentation.controllers"]),
    PortDesign(port_name="user_context provider", port_module="infrastructure/audit_logger.py",
               adapter_module="presentation/auth_middleware.py", methods=["() -> user"],
               resolves=["infrastructure.audit_logger->presentation.auth_middleware"]),
])


def main() -> int:
    audit, _ = engine.audit(DEMO_CODEBASE, BLUEPRINT)
    result = engine.verify(DEMO_CODEBASE, BLUEPRINT, PATCHES, audit)
    print(result.model_dump_json(indent=1, exclude={"test_output"}))
    if not result.passed:
        print("verification failed; cache not written", file=sys.stderr)
        return 1
    req = HealingRequest(request_id="precompute", codebase_path=audit.codebase, blueprint_id=BLUEPRINT, audit=audit)
    files = sorted({v.file_path for v in audit.violations if v.file_path})
    sources = "\n\n".join(f"### {f}\n```python\n{engine.read_module(audit.codebase, f)}\n```" for f in files)
    _save_demo(_demo_key(req, sources), PLAN, PATCHES)
    print("wrote demo_cache.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
