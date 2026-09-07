import zipfile
import os
from pathlib import Path

# Base directory for the demo codebase
base_dir = Path(r"C:\Users\krish\OneDrive\Desktop\Archon\test_codebases\ecommerce_platform")
base_dir.mkdir(parents=True, exist_ok=True)

files = {
    # ── Root entrypoint ────────────────────────────────────────────────────────
    "main.py": """import uvicorn
from presentation.api import app
from application.order_service import OrderService
from infrastructure.database import init_db

if __name__ == "__main__":
    init_db()
    uvicorn.run(app, host="0.0.0.0", port=8000)
""",

    # ── Domain Layer (Core business rules - pure logic) ──────────────────────
    "domain/__init__.py": "",
    
    "domain/models.py": """from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime
import uuid

@dataclass
class OrderItem:
    item_id: str
    quantity: int
    unit_price: float

@dataclass
class Order:
    order_id: str
    customer_id: str
    items: List[OrderItem]
    status: str
    created_at: datetime
    total_amount: float
""",

    "domain/order_calculator.py": """from domain.models import Order, OrderItem
import math

class OrderCalculator:
    @staticmethod
    def calculate_subtotal(order: Order) -> float:
        return sum(item.quantity * item.unit_price for item in order.items)

    @staticmethod
    def apply_tax(subtotal: float, tax_rate: float = 0.08) -> float:
        return round(subtotal * (1 + tax_rate), 2)
""",

    # [VIOLATION 1]: Domain importing external HTTP package & Infrastructure directly!
    "domain/fraud_checker.py": """import requests
import json
from domain.models import Order
from infrastructure.database import DatabaseConnection  # VIOLATION: Domain -> Infrastructure

class FraudChecker:
    def __init__(self):
        self.db = DatabaseConnection()

    def is_suspicious(self, order: Order) -> bool:
        # Directly querying DB inside domain entity logic
        recent_txns = self.db.query("SELECT COUNT(*) FROM transactions WHERE customer_id = %s", order.customer_id)
        # Directly calling external 3rd-party fraud API inside Domain layer
        response = requests.post("https://api.fraudguard.io/check", json={"customer": order.customer_id})
        return response.status_code == 200 and recent_txns > 10
""",

    # [VIOLATION 2]: Domain importing Presentation controller!
    "domain/payment_rule.py": """from domain.models import Order
from presentation.controllers import ResponseFormatter  # VIOLATION: Domain -> Presentation

class PaymentRuleValidator:
    def validate_min_amount(self, order: Order) -> bool:
        if order.total_amount <= 0:
            # Using presentation formatter inside pure domain
            ResponseFormatter.format_error("Amount must be positive")
            return False
        return True
""",

    # ── Application Layer (Use cases & orchestration) ────────────────────────
    "application/__init__.py": "",

    "application/order_service.py": """from domain.models import Order, OrderItem
from domain.order_calculator import OrderCalculator
from typing import List
import datetime
import uuid

class OrderService:
    def __init__(self, repo, payment_gateway, event_publisher):
        self.repo = repo
        self.payment_gateway = payment_gateway
        self.event_publisher = event_publisher

    def create_order(self, customer_id: str, items: List[dict]) -> Order:
        order_items = [OrderItem(**it) for it in items]
        order = Order(
            order_id=str(uuid.uuid4()),
            customer_id=customer_id,
            items=order_items,
            status="PENDING",
            created_at=datetime.datetime.now(),
            total_amount=0.0
        )
        subtotal = OrderCalculator.calculate_subtotal(order)
        order.total_amount = OrderCalculator.apply_tax(subtotal)
        
        self.repo.save(order)
        self.payment_gateway.charge(order.total_amount, customer_id)
        self.event_publisher.publish("order.created", {"order_id": order.order_id})
        return order
""",

    "application/inventory_service.py": """from typing import Dict
import logging

class InventoryService:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def check_stock(self, item_id: str, quantity: int) -> bool:
        self.logger.info(f"Checking stock for {item_id}")
        return True

    def deduct_stock(self, item_id: str, quantity: int):
        self.logger.info(f"Deducted {quantity} from {item_id}")
""",

    # ── Infrastructure Layer (Persistence, Gateways, External APIs) ──────────
    "infrastructure/__init__.py": "",

    "infrastructure/database.py": """import sqlite3
import os

class DatabaseConnection:
    def __init__(self):
        self.db_path = os.getenv("DB_PATH", "store.db")

    def query(self, sql: str, *args):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(sql, args)
        res = cursor.fetchall()
        conn.close()
        return len(res)

def init_db():
    print("[DB] Database initialized.")
""",

    "infrastructure/stripe_client.py": """import stripe
import os

class StripeGateway:
    def __init__(self):
        self.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_mock")
        stripe.api_key = self.api_key

    def charge(self, amount: float, customer_id: str) -> dict:
        return {"status": "succeeded", "charge_id": "ch_mock_123"}
""",

    "infrastructure/kafka_producer.py": """import json
import socket

class KafkaEventPublisher:
    def __init__(self, broker_url: str = "localhost:9092"):
        self.broker = broker_url
        self.host = socket.gethostname()

    def publish(self, topic: str, payload: dict):
        data = json.dumps(payload)
        print(f"[Kafka] Published to {topic}: {data}")
""",

    # [VIOLATION 3]: Infrastructure importing Presentation middleware!
    "infrastructure/audit_logger.py": """import datetime
from presentation.auth_middleware import get_current_user_context  # VIOLATION: Infrastructure -> Presentation

class AuditLogger:
    @staticmethod
    def log_action(action: str):
        # Infrastructure reaches into presentation auth token context
        user = get_current_user_context()
        print(f"[{datetime.datetime.now()}] Action: {action} by User: {user}")
""",

    # ── Presentation Layer (API, Routers, CLI) ───────────────────────────────
    "presentation/__init__.py": "",

    "presentation/api.py": """from fastapi import FastAPI
from presentation.order_routes import router as order_router

app = FastAPI(title="E-Commerce API")
app.include_router(order_router, prefix="/orders")
""",

    "presentation/controllers.py": """from typing import Any, Dict

class ResponseFormatter:
    @staticmethod
    def format_success(data: Any) -> Dict[str, Any]:
        return {"status": "success", "data": data}

    @staticmethod
    def format_error(message: str) -> Dict[str, Any]:
        return {"status": "error", "message": message}
""",

    "presentation/auth_middleware.py": """import os
import jose

def get_current_user_context():
    # Mock token extraction
    return "admin_user_42"
""",

    # [VIOLATION 4]: Presentation directly bypassing Application to query Database!
    "presentation/order_routes.py": """from fastapi import APIRouter
from application.order_service import OrderService
from infrastructure.database import DatabaseConnection  # VIOLATION: Presentation -> Infrastructure (Bypasses Use-Case)
from presentation.controllers import ResponseFormatter

router = APIRouter()

@router.get("/{order_id}")
def get_order_details(order_id: str):
    # Presentation directly running SQL on Infrastructure instead of asking Application layer
    db = DatabaseConnection()
    data = db.query("SELECT * FROM orders WHERE id = %s", order_id)
    return ResponseFormatter.format_success(data)
"""
}

# Write files
for rel_path, content in files.items():
    file_path = base_dir / rel_path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

print(f"[OK] Generated {len(files)} files in {base_dir}")

# Create the ZIP archive
zip_path = Path(r"C:\Users\krish\OneDrive\Desktop\Archon\test_codebases\ecommerce_platform.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for file_path in base_dir.rglob("*"):
        if file_path.is_file():
            arcname = file_path.relative_to(base_dir)
            zf.write(file_path, arcname)

print(f"[OK] Created demo zip archive: {zip_path}")
