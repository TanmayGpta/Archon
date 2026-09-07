from fastapi import APIRouter
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
