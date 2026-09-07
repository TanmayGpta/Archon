from domain.models import Order, OrderItem
import math

class OrderCalculator:
    @staticmethod
    def calculate_subtotal(order: Order) -> float:
        return sum(item.quantity * item.unit_price for item in order.items)

    @staticmethod
    def apply_tax(subtotal: float, tax_rate: float = 0.08) -> float:
        return round(subtotal * (1 + tax_rate), 2)
