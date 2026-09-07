import requests
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
