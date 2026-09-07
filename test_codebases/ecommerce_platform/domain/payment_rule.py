from domain.models import Order
from presentation.controllers import ResponseFormatter  # VIOLATION: Domain -> Presentation

class PaymentRuleValidator:
    def validate_min_amount(self, order: Order) -> bool:
        if order.total_amount <= 0:
            # Using presentation formatter inside pure domain
            ResponseFormatter.format_error("Amount must be positive")
            return False
        return True
