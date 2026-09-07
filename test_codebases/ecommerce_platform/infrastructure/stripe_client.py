import stripe
import os

class StripeGateway:
    def __init__(self):
        self.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_mock")
        stripe.api_key = self.api_key

    def charge(self, amount: float, customer_id: str) -> dict:
        return {"status": "succeeded", "charge_id": "ch_mock_123"}
