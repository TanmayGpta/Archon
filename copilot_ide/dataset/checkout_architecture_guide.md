## Overview
The Order Management Service orchestrates two external APIs: Stripe for payment collection and SendGrid for receipt delivery. This guide details the complete end-to-end checkout and refund lifecycle, specifying each endpoint invocation, header, and parameter requirements.

## Step 1: Place Order via POST /orders
To initiate the purchase flow, the client calls `POST /orders` on the Order Management API with the required payload containing `customer_id`, `items`, and `total_amount` in cents. The service validates the cart items, records a new order in the database, and returns a response containing the generated `order_id` with `status: pending` alongside the customer's `notification_email`.

## Step 2: Charge the Customer via Stripe POST /charges
After creating the order record, the Order Management Service collects payment by invoking Stripe's `POST /charges` endpoint. The request payload includes the `amount` in cents, the `currency` (e.g. `usd`), and the customer's payment `source` token. Upon successful payment authorization, Stripe returns a `200 OK` containing a unique `charge_id`. The service immediately persists this `charge_id` against the order record and transitions the order status to `paid`.

## Step 3: Trigger Refund via POST /orders/{order_id}/refund
When a customer requests a return or cancellation, the client triggers a refund by invoking `POST /orders/{order_id}/refund`. The request body must include the Stripe `charge_id`, the refund `amount` in cents, and a `reason` (such as `duplicate`, `fraudulent`, or `requested_by_customer`). The Order Management Service internally delegates this request to Stripe's `POST /refunds` endpoint. The `Idempotency-Key` header is mandatory on both calls to prevent double-refunds. Callers must supply the duplicate-prevention key in the header on every retry attempt to guarantee safety.

## Step 4: Send Receipt via SendGrid
Following a successful payment settlement from Stripe, the Order Management Service sends a transactional receipt email to the buyer. It invokes SendGrid's email send endpoint `POST /mail/send` with a JSON payload containing the customer's `notification_email` under `personalizations`, the sender address under `from`, a receipt `subject`, and the order summary including the Stripe `charge_id` reference number in the message `content`.

## Error Handling
If Stripe's `POST /charges` returns a non-200 response (such as a card decline or insufficient funds), the Order Management Service immediately halts the workflow. The order status is set to `failed`, no SendGrid email is sent, and the client receives a `402 Payment Required` response with an explanatory error payload.
