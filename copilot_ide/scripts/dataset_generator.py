import os

os.makedirs("dataset", exist_ok=True)

payments_yaml = """
openapi: 3.0.3
info:
  title: Enterprise Payments API
  version: 2.1.0
paths:
  /v2/payments/charge:
    post:
      summary: Create a card charge
      description: Requires Idempotency-Key header and Bearer Auth token.
      parameters:
        - in: header
          name: Idempotency-Key
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [amount, currency, customer_id]
              properties:
                amount:
                  type: integer
                  description: Amount in cents (e.g. 1000 = $10.00)
                currency:
                  type: string
                  example: usd
                customer_id:
                  type: string
                  example: cus_89210
  /v2/payments/refund:
    post:
      summary: Issue a payment refund
      parameters:
        - in: header
          name: Idempotency-Key
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [charge_id, amount]
              properties:
                charge_id:
                  type: string
                amount:
                  type: integer
                reason:
                  type: string
                  enum: [duplicate, fraudulent, requested_by_customer]
"""

with open("dataset/payments_v2.yaml", "w") as f:
    f.write(payments_yaml)

print("Dataset generated successfully in ./dataset/")
