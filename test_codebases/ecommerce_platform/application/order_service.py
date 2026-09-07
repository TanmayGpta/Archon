from domain.models import Order, OrderItem
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
