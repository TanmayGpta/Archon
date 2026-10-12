import os
import json
import yaml

dataset_dir = "dataset"
os.makedirs(dataset_dir, exist_ok=True)

# ==========================================
# 1. EXISTING FILES
# ==========================================

# 1.1 Stripe Full OpenAPI 3.0 YAML
def generate_stripe_full_openapi():
    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": "Stripe Full API",
            "version": "v1",
            "description": "Comprehensive B2B Payment processing API."
        },
        "servers": [{"url": "https://api.stripe.com/v1"}],
        "paths": {
            "/customers": {
                "post": {
                    "summary": "Create a customer",
                    "description": "Creates a new customer object.",
                    "requestBody": {
                        "content": {
                            "application/x-www-form-urlencoded": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "email": {"type": "string"},
                                        "name": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                },
                "get": {
                    "summary": "List all customers",
                    "parameters": [
                        {"name": "limit", "in": "query", "schema": {"type": "integer"}}
                    ]
                }
            },
            "/payment_intents": {
                "post": {
                    "summary": "Create a PaymentIntent",
                    "requestBody": {
                        "content": {
                            "application/x-www-form-urlencoded": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "amount": {"type": "integer"},
                                        "currency": {"type": "string"},
                                        "customer": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/subscriptions": {
                "post": {
                    "summary": "Create a Subscription",
                    "description": "Subscribes a customer to a specific price plan.",
                    "requestBody": {
                        "content": {
                            "application/x-www-form-urlencoded": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "customer": {"type": "string"},
                                        "items[0][price]": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/invoices": {
                "get": {
                    "summary": "List all invoices",
                    "parameters": [
                        {"name": "customer", "in": "query", "schema": {"type": "string"}}
                    ]
                }
            }
        }
    }
    return yaml.dump(spec, sort_keys=False)

# 1.2 SendGrid Swagger 2.0 JSON
def generate_sendgrid_swagger_2():
    spec = {
        "swagger": "2.0",
        "info": {
            "title": "SendGrid V3 API (Swagger 2.0)",
            "version": "3.0.0"
        },
        "host": "api.sendgrid.com",
        "basePath": "/v3",
        "paths": {
            "/mail/send": {
                "post": {
                    "summary": "Send an email",
                    "parameters": [
                        {
                            "in": "body",
                            "name": "body",
                            "required": True,
                            "schema": {
                                "$ref": "#/definitions/MailSendRequest"
                            }
                        }
                    ]
                }
            },
            "/templates": {
                "get": {
                    "summary": "Retrieve all transactional templates",
                    "responses": {
                        "200": {"description": "List of templates"}
                    }
                }
            }
        },
        "definitions": {
            "MailSendRequest": {
                "type": "object",
                "properties": {
                    "personalizations": {"type": "array"},
                    "from": {"type": "object", "properties": {"email": {"type": "string"}}},
                    "subject": {"type": "string"}
                }
            }
        }
    }
    return json.dumps(spec, indent=4)

# 1.3 Slack Developer Guide Markdown
def generate_slack_dev_guide():
    return """# Slack API Developer Guide

Welcome to the Slack API! Unlike traditional REST specs, here is how you use our API.

## Authentication
All requests must include a Bearer token in the header: `Authorization: Bearer xoxb-your-token`.

## POST /api/chat.postMessage
Sends a message to a channel.
**Content-Type:** application/json

**Payload:**
- `channel` (string, required): The ID of the channel.
- `text` (string, required): The message content.
- `blocks` (array, optional): UI blocks for rich formatting.

## GET /api/users.list
Returns a list of all users in the workspace.
**Query Parameters:**
- `limit` (integer): Number of users to return.
- `cursor` (string): Pagination cursor.
"""

# 1.4 Twilio Postman Collection JSON
def generate_twilio_postman_collection():
    collection = {
        "info": {
            "name": "Twilio Communication API",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        "item": [
            {
                "name": "Send SMS",
                "request": {
                    "method": "POST",
                    "header": [{"key": "Authorization", "value": "Basic {{auth}}"}],
                    "url": {
                        "raw": "https://api.twilio.com/2010-04-01/Accounts/:AccountSid/Messages.json",
                        "host": ["https://api.twilio.com"],
                        "path": ["2010-04-01", "Accounts", ":AccountSid", "Messages.json"]
                    },
                    "body": {
                        "mode": "urlencoded",
                        "urlencoded": [
                            {"key": "To", "value": "+1234567890"},
                            {"key": "From", "value": "+0987654321"},
                            {"key": "Body", "value": "Hello World"}
                        ]
                    }
                }
            },
            {
                "name": "Fetch Call Logs",
                "request": {
                    "method": "GET",
                    "url": {
                        "raw": "https://api.twilio.com/2010-04-01/Accounts/:AccountSid/Calls.json",
                        "host": ["https://api.twilio.com"],
                        "path": ["2010-04-01", "Accounts", ":AccountSid", "Calls.json"]
                    }
                }
            }
        ]
    }
    return json.dumps(collection, indent=4)


# ==========================================
# 2. DOMAIN A: E-COMMERCE & NOTIFICATIONS
# ==========================================

# File A1: order_management_api.yaml
def generate_order_management_api():
    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": "Order Management API",
            "version": "1.0.0",
            "description": "Internal microservice for order placement and refund initiation. Integrates with Stripe payments and SendGrid receipts."
        },
        "servers": [{"url": "https://api.archon.internal/v1"}],
        "paths": {
            "/orders": {
                "post": {
                    "summary": "Place a new order",
                    "description": "Creates a new order in pending status and records customer purchase details.",
                    "security": [{"bearerAuth": []}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["customer_id", "items", "total_amount"],
                                    "properties": {
                                        "customer_id": {
                                            "type": "string",
                                            "description": "Unique customer identifier",
                                            "example": "cus_98412"
                                        },
                                        "items": {
                                            "type": "array",
                                            "description": "List of items purchased in the order",
                                            "items": {
                                                "type": "object",
                                                "required": ["item_id", "quantity", "unit_price"],
                                                "properties": {
                                                    "item_id": {"type": "string"},
                                                    "quantity": {"type": "integer"},
                                                    "unit_price": {"type": "integer"}
                                                }
                                            }
                                        },
                                        "total_amount": {
                                            "type": "integer",
                                            "description": "Total order amount in cents (e.g. 5000 = $50.00)",
                                            "example": 5000
                                        },
                                        "notification_email": {
                                            "type": "string",
                                            "description": "Customer email address for SendGrid receipt notification",
                                            "example": "customer@example.com"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "201": {
                            "description": "Order placed successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "order_id": {"type": "string", "example": "ord_102938"},
                                            "status": {"type": "string", "example": "pending"},
                                            "customer_id": {"type": "string"},
                                            "total_amount": {"type": "integer"},
                                            "notification_email": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/orders/{order_id}": {
                "get": {
                    "summary": "Retrieve order status",
                    "description": "Fetches full details and current lifecycle status for an existing order.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "order_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                            "description": "Unique identifier of the order"
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Order details retrieved successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "order_id": {"type": "string"},
                                            "status": {
                                                "type": "string",
                                                "enum": ["pending", "paid", "fulfilled", "refunded", "failed"]
                                            },
                                            "charge_id": {
                                                "type": "string",
                                                "description": "The associated Stripe charge identifier"
                                            },
                                            "total_amount": {"type": "integer"},
                                            "notification_email": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/orders/{order_id}/refund": {
                "post": {
                    "summary": "Initiate an order refund",
                    "description": "Initiates a refund for an existing order by delegating to Stripe. Requires Idempotency-Key header.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "order_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                            "description": "Unique identifier of the order to refund"
                        },
                        {
                            "name": "Idempotency-Key",
                            "in": "header",
                            "required": True,
                            "schema": {"type": "string"},
                            "description": "Unique idempotency key to prevent double-refunds on network retries"
                        }
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["charge_id", "amount", "reason"],
                                    "properties": {
                                        "charge_id": {
                                            "type": "string",
                                            "description": "The Stripe charge ID associated with the original payment",
                                            "example": "ch_3Mtw9K2eZvKYlo2C0Vv"
                                        },
                                        "amount": {
                                            "type": "integer",
                                            "description": "Amount in cents to refund",
                                            "example": 5000
                                        },
                                        "reason": {
                                            "type": "string",
                                            "enum": ["duplicate", "fraudulent", "requested_by_customer"],
                                            "description": "Reason for issuing the refund"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Refund initiated successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "refund_id": {"type": "string"},
                                            "order_id": {"type": "string"},
                                            "charge_id": {"type": "string"},
                                            "amount": {"type": "integer"},
                                            "status": {"type": "string", "example": "refunded"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/orders/{order_id}/status": {
                "get": {
                    "summary": "Poll fulfilment status",
                    "description": "Polls the asynchronous warehouse fulfilment and shipping status for an order.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "order_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                            "description": "Order identifier to query fulfilment status for"
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Fulfilment status retrieved",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "order_id": {"type": "string"},
                                            "fulfilment_status": {
                                                "type": "string",
                                                "enum": ["unfulfilled", "processing", "shipped", "delivered", "cancelled"]
                                            },
                                            "updated_at": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer"
                }
            }
        }
    }
    return yaml.dump(spec, sort_keys=False)

# File A2: checkout_architecture_guide.md
def generate_checkout_architecture_guide():
    return """## Overview
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
"""


# ==========================================
# 3. DOMAIN B: INCIDENT ALERTING
# ==========================================

# File B1: alerting_service_api.yaml
def generate_alerting_service_api():
    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": "Alerting Service API",
            "version": "1.0.0",
            "description": "Internal alerting microservice consumed by monitoring tools to fire incident notifications across multiple channels."
        },
        "servers": [{"url": "https://api.archon.internal/v1"}],
        "paths": {
            "/alerts": {
                "post": {
                    "summary": "Trigger a new alert",
                    "description": "Evaluates and dispatches a monitoring alert to configured channels based on severity level.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "Idempotency-Key",
                            "in": "header",
                            "required": False,
                            "schema": {"type": "string"},
                            "description": "Optional idempotency key to prevent duplicate alert generation on retry"
                        }
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["severity", "message", "service_name"],
                                    "properties": {
                                        "severity": {
                                            "type": "string",
                                            "enum": ["critical", "warning", "info"],
                                            "description": "Severity classification determining notification channels",
                                            "example": "critical"
                                        },
                                        "message": {
                                            "type": "string",
                                            "description": "Human-readable alert summary text",
                                            "example": "Database connection pool exhausted on checkout-service"
                                        },
                                        "service_name": {
                                            "type": "string",
                                            "description": "Name of the originating service",
                                            "example": "order-management-service"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "201": {
                            "description": "Alert triggered and dispatched",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "alert_id": {"type": "string", "example": "alt_77192"},
                                            "status": {"type": "string", "example": "open"},
                                            "channels_notified": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "example": ["twilio_sms", "slack_channel"]
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/alerts/{alert_id}": {
                "get": {
                    "summary": "Fetch alert delivery status",
                    "description": "Retrieves the current status, notification logs, and acknowledgement state of an alert.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "alert_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                            "description": "Unique identifier of the alert"
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Alert status details",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "alert_id": {"type": "string"},
                                            "severity": {
                                                "type": "string",
                                                "enum": ["critical", "warning", "info"]
                                            },
                                            "message": {"type": "string"},
                                            "service_name": {"type": "string"},
                                            "status": {
                                                "type": "string",
                                                "enum": ["open", "acknowledged", "resolved"]
                                            },
                                            "channels_notified": {
                                                "type": "array",
                                                "items": {"type": "string"}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/alerts/{alert_id}/escalate": {
                "post": {
                    "summary": "Escalate an unacknowledged alert",
                    "description": "Re-evaluates and escalates an unacknowledged alert after SLA breach, re-notifying all emergency channels.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "alert_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                            "description": "Unique identifier of the alert to escalate"
                        }
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["escalation_reason"],
                                    "properties": {
                                        "escalation_reason": {
                                            "type": "string",
                                            "example": "On-call engineer did not acknowledge alert within 15 minutes"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Alert successfully escalated",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "alert_id": {"type": "string"},
                                            "escalated": {"type": "boolean", "example": True},
                                            "channels_notified": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "example": ["twilio_sms", "slack_channel"]
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/alerts/test": {
                "post": {
                    "summary": "Send a test notification",
                    "description": "Dispatches a synthetic test notification across all configured notification providers to verify connectivity.",
                    "security": [{"bearerAuth": []}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["message"],
                                    "properties": {
                                        "message": {
                                            "type": "string",
                                            "example": "Synthetic end-to-end ping test"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Test ping dispatched successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "status": {"type": "string", "example": "success"},
                                            "channels_notified": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "example": ["twilio_sms", "slack_channel"]
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer"
                }
            }
        }
    }
    return yaml.dump(spec, sort_keys=False)

# File B2: incident_response_workflow.md
def generate_incident_response_workflow():
    return """## Overview
The Alerting Service evaluates each `POST /alerts` request and decides whether to dispatch via Twilio SMS, Slack channel message, or both, based on alert severity. This workflow describes the routing rules, transport protocols, token structures, and escalation policies.

## Severity-Based Routing Rules
When a service triggers an incident alert via `POST /alerts`, the dispatch engine inspects the `severity` field:
- `critical`: Dispatches immediate SMS to the on-call engineer via Twilio `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` AND posts a high-priority incident card to Slack via `POST /api/chat.postMessage`. Both `"twilio_sms"` and `"slack_channel"` are returned in `channels_notified`.
- `warning`: Dispatches notification exclusively to Slack via `POST /api/chat.postMessage` in `#alerts-warning`. Twilio SMS is omitted.
- `info`: Dispatches internal log event only. No external paging or notification is triggered.

## Twilio SMS Dispatch
For critical severity incidents, the service contacts Twilio. The adapter formats an HTTP request with `Basic Auth` using the base64-encoded `AccountSid` and `AuthToken` (`Authorization: Basic <base64(AccountSid:AuthToken)>`). It targets `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` with url-encoded fields: `To` (the on-call engineer phone number), `From` (the verified Twilio sender number), and `Body` (containing the incident `message` and `service_name`). The SMS gateway ensures immediate mobile delivery even when engineers are away from workstation terminals.

## Slack Channel Dispatch
For `critical` and `warning` incidents, the service sends a structured message to Slack. It authenticates using the Slack bot token (`Authorization: Bearer xoxb-{token}`) documented in the Slack Developer Guide. The call targets `POST /api/chat.postMessage` with a JSON payload specifying `channel: "#incidents"` and `text: message`.

## Escalation Flow
If an incident alert remains in `status: open` for more than 15 minutes without responder intervention, the monitoring supervisor triggers `POST /alerts/{alert_id}/escalate`. The escalation endpoint forces an immediate re-notification across all emergency channels (`twilio_sms` and `slack_channel`), alerting secondary on-call staff regardless of original severity level.

## Alert Acknowledgement
When the on-call engineer begins triage, they acknowledge the incident through the monitoring dashboard. The dashboard calls `GET /alerts/{alert_id}` to verify state and updates the alert to `status: acknowledged`. Once remediation is complete, the alert is transitioned to `status: resolved`.
"""


# ==========================================
# 4. DOMAIN C: CI/CD & VERSION CONTROL
# ==========================================

# File C1: github_webhooks_api.yaml
def generate_github_webhooks_api():
    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": "GitHub Webhooks Receiver API",
            "version": "1.0.0",
            "description": "Internal webhook receiver microservice that listens for GitHub push and pull request events to drive automated deployment pipelines."
        },
        "servers": [{"url": "https://api.archon.internal/webhooks"}],
        "paths": {
            "/webhooks/github/push": {
                "post": {
                    "summary": "Receive GitHub push event",
                    "description": "Ingests Git push webhook notifications from GitHub repository events to initiate continuous integration and deployment.",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["ref", "repository", "pusher", "commits"],
                                    "properties": {
                                        "ref": {
                                            "type": "string",
                                            "description": "Git reference branch name (e.g. refs/heads/main)",
                                            "example": "refs/heads/main"
                                        },
                                        "repository": {
                                            "type": "object",
                                            "required": ["name", "full_name"],
                                            "properties": {
                                                "name": {"type": "string", "example": "apiCopilot"},
                                                "full_name": {"type": "string", "example": "ArchonCorp/apiCopilot"}
                                            }
                                        },
                                        "pusher": {
                                            "type": "object",
                                            "required": ["name", "email"],
                                            "properties": {
                                                "name": {"type": "string", "example": "octocat"},
                                                "email": {"type": "string", "example": "deployer@archon.corp"}
                                            }
                                        },
                                        "commits": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "id": {"type": "string"},
                                                    "message": {"type": "string"}
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Webhook push event accepted",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "status": {"type": "string", "example": "received"},
                                            "event_id": {"type": "string", "example": "evt_push_88123"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/webhooks/github/pull_request": {
                "post": {
                    "summary": "Receive GitHub pull request event",
                    "description": "Ingests GitHub pull request activity (opened, merged, closed) for build automation.",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["action", "pull_request", "repository"],
                                    "properties": {
                                        "action": {
                                            "type": "string",
                                            "enum": ["opened", "merged", "closed"],
                                            "example": "merged"
                                        },
                                        "pull_request": {
                                            "type": "object",
                                            "required": ["number", "title", "merged"],
                                            "properties": {
                                                "number": {"type": "integer", "example": 42},
                                                "title": {"type": "string", "example": "Release v2.4.0 payment fixes"},
                                                "merged": {"type": "boolean", "example": True}
                                            }
                                        },
                                        "repository": {
                                            "type": "object",
                                            "properties": {
                                                "name": {"type": "string"},
                                                "full_name": {"type": "string"}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "PR event processed",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "status": {"type": "string", "example": "received"},
                                            "event_id": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/webhooks/github/deliveries": {
                "get": {
                    "summary": "List webhook delivery attempts",
                    "description": "Fetches a historical log of webhook delivery payloads received by the receiver service.",
                    "parameters": [
                        {
                            "name": "limit",
                            "in": "query",
                            "required": False,
                            "schema": {"type": "integer", "default": 20},
                            "description": "Maximum number of delivery records to return"
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Delivery records retrieved",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "deliveries": {
                                                "type": "array",
                                                "items": {
                                                    "type": "object",
                                                    "properties": {
                                                        "delivery_id": {"type": "string"},
                                                        "event": {"type": "string"},
                                                        "delivered_at": {"type": "string"},
                                                        "status_code": {"type": "integer"}
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/webhooks/github/ping": {
                "post": {
                    "summary": "Initial GitHub webhook ping handshake",
                    "description": "Responds to initial GitHub repository webhook configuration validation pings.",
                    "responses": {
                        "200": {
                            "description": "Webhook receiver online and ready",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "status": {"type": "string", "example": "ok"},
                                            "zen": {"type": "string", "example": "Responsive is better than fast."}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return yaml.dump(spec, sort_keys=False)

# File C2: ci_cd_deployment_guide.md
def generate_ci_cd_deployment_guide():
    return """## Overview
A push to the `main` branch triggers the full CI/CD pipeline. The pipeline uses the GitHub Webhooks receiver, the internal Alerting Service, and SendGrid for deployment outcome notifications. This guide details each execution stage, branch filtering, testing gates, and alerting integrations.

## Trigger: Push Event on main Branch
When a developer pushes changes, GitHub sends a webhook payload to `POST /webhooks/github/push`. The receiver inspects the `ref` field in the payload. The pipeline only activates when `ref` equals `refs/heads/main`. Feature branch pushes (e.g. `refs/heads/feature/login`) are acknowledged with `200 OK` but ignored by the build runner.

## CI Stage: Running Tests
Upon receiving a valid `main` branch push, the CI runner initializes an isolated container environment and runs unit, integration, and security test suites. If any test suite fails, execution halts immediately, and the deployment is aborted before touching staging or production clusters.

## CD Stage: Deployment
On successful test pass, the continuous delivery stage builds production containers and applies Kubernetes manifests. The `pusher.name` from the webhook payload is logged as the deployer for audit compliance, and deployment metadata is attached to the build artifact.

## Success Notification via Alerting Service
On successful deployment, the pipeline calls `POST /alerts` (from `alerting_service_api.yaml`) with `severity: info` and `message` containing the repository name, commit hash, and deployer name. This results in a Slack notification to `#deployments` without paging on-call staff. Pipeline engineers also refer to this step as posting a deployment status message to team chat.

## Failure Notification via Alerting Service
If tests fail or container deployment encounters a fatal error, the pipeline calls `POST /alerts` with `severity: critical`. As specified in the incident routing rules, this triggers both a Twilio SMS to the on-call engineer AND a Slack message to `#incidents`. Additionally, SendGrid is invoked to send an incident report email to `pusher.email`.

## Pull Request Merge Handling
When a pull request is merged into the base branch, GitHub fires `POST /webhooks/github/pull_request`. When the payload contains `action: merged` and `pull_request.merged: true`, the pipeline treats it identically to a `main` branch push and begins the full automated deployment flow.
"""


# ==========================================
# 5. DOMAIN D: SUPPORT & TICKETING
# ==========================================

# File D1: zendesk_tickets_api.yaml
def generate_zendesk_tickets_api():
    spec = {
        "openapi": "3.0.3",
        "info": {
            "title": "Zendesk Support Tickets API",
            "version": "2.0.0",
            "description": "Mock Zendesk ticketing microservice for support management, refund triage, and customer communication."
        },
        "servers": [{"url": "https://api.archon.internal/zendesk"}],
        "paths": {
            "/api/v2/tickets": {
                "post": {
                    "summary": "Create a support ticket",
                    "description": "Creates a new customer support ticket in the ticketing queue.",
                    "security": [{"bearerAuth": []}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["subject", "comment", "requester"],
                                    "properties": {
                                        "subject": {
                                            "type": "string",
                                            "example": "Requesting refund for order 102938"
                                        },
                                        "comment": {
                                            "type": "object",
                                            "required": ["body"],
                                            "properties": {
                                                "body": {
                                                    "type": "string",
                                                    "example": "Customer requested full refund due to defective item."
                                                }
                                            }
                                        },
                                        "requester": {
                                            "type": "object",
                                            "required": ["name", "email"],
                                            "properties": {
                                                "name": {"type": "string", "example": "Jane Doe"},
                                                "email": {"type": "string", "example": "jane.doe@example.com"}
                                            }
                                        },
                                        "tags": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                            "example": ["refund_request", "ecommerce"]
                                        },
                                        "custom_fields": {
                                            "type": "object",
                                            "properties": {
                                                "charge_id": {
                                                    "type": "string",
                                                    "example": "ch_3Mtw9K2eZvKYlo2C0Vv"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "201": {
                            "description": "Ticket created successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "ticket": {
                                                "type": "object",
                                                "properties": {
                                                    "id": {"type": "integer", "example": 94102},
                                                    "subject": {"type": "string"},
                                                    "status": {"type": "string", "example": "new"},
                                                    "tags": {
                                                        "type": "array",
                                                        "items": {"type": "string"}
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/api/v2/tickets/{ticket_id}": {
                "get": {
                    "summary": "Retrieve ticket details",
                    "description": "Fetches ticket metadata, requester information, custom fields, tags, and status.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "ticket_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "integer"},
                            "description": "Unique Zendesk ticket ID"
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Ticket details retrieved",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "integer"},
                                            "subject": {"type": "string"},
                                            "status": {
                                                "type": "string",
                                                "enum": ["new", "open", "pending", "solved", "closed"]
                                            },
                                            "tags": {
                                                "type": "array",
                                                "items": {"type": "string"}
                                            },
                                            "requester": {
                                                "type": "object",
                                                "properties": {
                                                    "name": {"type": "string"},
                                                    "email": {"type": "string"}
                                                }
                                            },
                                            "custom_fields": {
                                                "type": "object",
                                                "properties": {
                                                    "charge_id": {"type": "string"}
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "put": {
                    "summary": "Update a ticket",
                    "description": "Updates ticket status, assigns agents, or appends public/internal comments.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "ticket_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "integer"},
                            "description": "Unique Zendesk ticket ID"
                        }
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": {
                                            "type": "string",
                                            "enum": ["new", "open", "pending", "solved", "closed"]
                                        },
                                        "comment": {
                                            "type": "object",
                                            "properties": {
                                                "body": {"type": "string"},
                                                "public": {"type": "boolean"}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Ticket updated successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "id": {"type": "integer"},
                                            "status": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "/api/v2/tickets/{ticket_id}/comments": {
                "get": {
                    "summary": "List ticket comments",
                    "description": "Retrieves all public and private comments associated with a support ticket.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [
                        {
                            "name": "ticket_id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "integer"},
                            "description": "Unique Zendesk ticket ID"
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Comment history retrieved",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "comments": {
                                                "type": "array",
                                                "items": {
                                                    "type": "object",
                                                    "properties": {
                                                        "id": {"type": "integer"},
                                                        "body": {"type": "string"},
                                                        "public": {"type": "boolean"},
                                                        "author_id": {"type": "integer"}
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer"
                }
            }
        }
    }
    return yaml.dump(spec, sort_keys=False)

# File D2: customer_support_workflow.md
def generate_customer_support_workflow():
    return """## Overview
Refund-related support tickets are triaged by the Support Workflow Engine, which links a Zendesk ticket to a Stripe refund and closes the loop with a SendGrid confirmation email. This document outlines the automated lifecycle from ticket classification to final resolution.

## Step 1: Ticket Identification
The Support Workflow Engine continuously monitors the support queue by polling `GET /api/v2/tickets/{ticket_id}`. It scans incoming tickets for `tags` containing `"refund_request"`. When an open ticket (`status: open`) is discovered with this tag, the engine extracts the Stripe reference stored in `custom_fields.charge_id` and the customer email from `requester.email` to begin the automated refund flow.

## Step 2: Issue Stripe Refund via POST /refunds
Using the extracted `charge_id`, the engine makes an authorized API call to Stripe's `POST /refunds` endpoint. The payload specifies the `charge` ID and optionally a partial `amount` in cents. To ensure strict idempotency and prevent double-refunding if network retries occur, the engine passes the Zendesk `ticket_id` in the `Idempotency-Key` header. Support engineers also refer to this step as reversing the original payment in the payment ledger.

## Step 3: Send Confirmation Email via SendGrid
Once Stripe responds with `200 OK` confirming the refund creation, the Support Workflow Engine invokes SendGrid's email send endpoint `POST /mail/send`. The message is delivered to `requester.email` with details including the Zendesk `ticket_id`, the refund amount, and the expected bank processing timeline (5–10 business days).

## Step 4: Close the Ticket
After the confirmation email is dispatched, the engine finalizes the support interaction by calling `PUT /api/v2/tickets/{ticket_id}` on the Zendesk API. It sets `status: solved` and appends an internal audit note recording the Stripe refund ID and SendGrid delivery confirmation.

## Error Handling
If Stripe's `POST /refunds` returns an error (for example, if the `charge_id` is invalid, already refunded, or disputed), the automated engine immediately pauses processing. It updates the Zendesk ticket to `status: pending` via `PUT /api/v2/tickets/{ticket_id}` and posts a private internal comment with the exact error details. No SendGrid email is sent, and the ticket is escalated to a human support agent for manual resolution.
"""


# ==========================================
# 6. DOMAIN E: CROSS-CUTTING CONCERNS
# ==========================================

# File E1: global_security_policies.md
def generate_global_security_policies():
    return """## Overview
This policy document defines the authentication schemes required across all internal and external APIs in the Archon Copilot platform. All services MUST comply. Security standards are strictly enforced at both the API Gateway layer and individual microservice boundaries.

## Bearer Token (JWT) Authentication
Bearer Token authentication using JSON Web Tokens (JWT) is the standard authentication scheme for internal microservices and developer APIs:
- Order Management API: Requires `Authorization: Bearer <token>` on all endpoints (`POST /orders`, `GET /orders/{order_id}`, `POST /orders/{order_id}/refund`, `GET /orders/{order_id}/status`).
- Zendesk Tickets API: Requires `Authorization: Bearer {api_token}` on `POST /api/v2/tickets`, `GET /api/v2/tickets/{ticket_id}`, `PUT /api/v2/tickets/{ticket_id}`, and comment endpoints.
- Slack Web API: Requires `Authorization: Bearer xoxb-{token}` bot token on `POST /api/chat.postMessage` and user list queries.

## HTTP Basic Authentication
HTTP Basic Authentication is strictly limited to legacy integration adapters:
- Twilio Communication API: Authenticates via `Authorization: Basic <base64(AccountSid:AuthToken)>` on endpoints such as `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`. No other internal service may use Basic Auth except Twilio integration adapters.

## API Key Authentication (Stripe)
Stripe uses a secret API key (`sk_live_...`) passed in the standard `Authorization` header formatted as `Authorization: Bearer sk_live_...`. This static secret key is distinct from short-lived JWT tokens. The `Idempotency-Key` header is a separate, mandatory safety header on all mutating Stripe and Order Management calls — it is NOT an authentication mechanism.

## Prohibited Schemes
To prevent credential leaks and session hijacking, the following security practices are strictly forbidden across all environments:
- API Key passed as a query parameter (e.g., `?api_key=` or `?token=`) is PROHIBITED.
- OAuth2 Implicit Grant Flow is PROHIBITED due to browser token exposure risks.
- Plaintext Basic Auth over unencrypted HTTP is PROHIBITED.
- All new internal services MUST implement Bearer JWT authentication.

## Standard Error Response Format
All internal APIs must return standardized error payloads to ensure uniform client error handling:
`{"error": {"code": <string>, "message": <string>, "http_status": <integer>}}`. External APIs (Stripe, SendGrid, Twilio, Slack) return vendor-specific error structures — internal integration adapters must catch and map these to the standard internal format before responding to callers.
"""

# File E2: api_gateway_routing.md
def generate_api_gateway_routing():
    return """## Overview
The central API Gateway (running at `api.archon.internal`) is the single ingress point for all external traffic. It routes to the Order Management API and the Alerting Service API, and enforces rate limiting, TLS termination, and authentication verification.

## Route Table
The API Gateway forwards external requests to internal microservices based on URL path prefixes:
- `/v1/orders/*` -> Order Management API (`POST /orders`, `GET /orders/{order_id}`, `POST /orders/{order_id}/refund`, `GET /orders/{order_id}/status`) hosted at `http://order-management-service.internal:8080`.
- `/v1/alerts/*` -> Alerting Service API (`POST /alerts`, `GET /alerts/{alert_id}`, `POST /alerts/{alert_id}/escalate`, `POST /alerts/test`) hosted at `http://alerting-service.internal:8080`.
The GitHub Webhooks receiver is NOT exposed through the gateway — it is triggered directly by GitHub on dedicated webhook ingress endpoints.

## Authentication Pass-Through
The API Gateway intercepts incoming requests and validates the external `Authorization: Bearer <jwt>` token against the centralized identity provider. Upon validation, the gateway strips the client token and injects an internal mTLS service identity token before proxying downstream. External third-party APIs such as Stripe, Twilio, and SendGrid are called directly by internal services, NOT through the gateway.

## Rate Limiting Rules
To maintain service reliability and protect downstream databases, the gateway enforces token bucket rate limiting:
- `POST /orders`: Enforces a limit of 100 requests/minute per `customer_id`.
- `POST /alerts`: Enforces a limit of 20 requests/minute per `service_name`.
When a client exceeds these configured thresholds, the gateway immediately returns HTTP `429 Too Many Requests` with a `Retry-After: 60` header.

## Zendesk and CI/CD Exclusions
The Zendesk Tickets API and GitHub Webhooks API are internal-only services not exposed through the gateway. The Zendesk integration runs as a background batch worker, and the GitHub Webhooks receiver operates behind a dedicated reverse proxy with cryptographic signature verification (`X-Hub-Signature-256`). They communicate across the internal service mesh only.
"""

# File E3: api_error_codes.md
def generate_api_error_codes():
    return """## Overview
This document is the canonical reference for all HTTP error codes returned by internal services and their required client handling strategies. When services encounter failures, clients must follow the recovery actions specified below.

## 4xx Client Errors
Client errors indicate malformed requests, invalid parameters, authentication failures, or business rule violations:
- `400 Bad Request` | Returned by: Order Management API, Zendesk API | Meaning: Missing required fields or schema validation failure. | Client Action: Fix payload structure and re-submit request.
- `401 Unauthorized` | Returned by: Any Service | Meaning: Invalid, expired, or missing Bearer token. | Client Action: Re-authenticate with identity provider and acquire a new token.
- `402 Payment Required` | Returned by: Order Management API | Meaning: Stripe charge failed due to insufficient funds or card decline. | Client Action: Notify customer to update payment method.
- `404 Not Found` | Returned by: Any Service | Meaning: Target resource ID does not exist in the database. | Client Action: Verify resource ID; do not retry request without changes.
- `409 Conflict` | Returned by: Order Management API | Meaning: Duplicate `Idempotency-Key` submitted with differing request body. | Client Action: Verify original request status before retrying.
- `422 Unprocessable Entity` | Returned by: Alerting Service | Meaning: Invalid severity enum value supplied (must be critical, warning, info). | Client Action: Correct enum parameter and retry.
- `429 Too Many Requests` | Returned by: API Gateway | Meaning: Rate limit exceeded for customer or service. | Client Action: Back off for 60 seconds before retrying.

## 5xx Server Errors
Server errors indicate internal service outages, network partitions, or upstream integration timeouts:
- `500 Internal Server Error` | Returned by: Any Service | Meaning: Unhandled internal exception. | Client Action: Retry with exponential backoff, maximum 3 attempts.
- `502 Bad Gateway` | Returned by: API Gateway | Meaning: Upstream microservice is unreachable or crashed. | Client Action: Alert the on-call team via `POST /alerts` with `severity: critical`.
- `503 Service Unavailable` | Returned by: Any Service | Meaning: Service temporarily overloaded or under maintenance. | Client Action: Respect the `Retry-After` header value before retrying.

## External API Error Mapping
When third-party APIs fail, internal adapters map external error codes into standardized internal HTTP responses:
- Stripe `card_error` (e.g. `card_declined`) maps to internal `402 Payment Required`.
- Twilio error `21211` (invalid destination phone number) maps to internal `400 Bad Request`.
- SendGrid error `403 Forbidden` (unverified sender identity) maps to internal `500 Internal Server Error` (must fix mail configuration).

## Idempotency and Retry Safety
Only safe and idempotent requests should be retried automatically upon network disconnects or 5xx errors:
- `GET` requests are always safe to retry.
- Mutating operations (`POST /orders`, `POST /orders/{order_id}/refund`, Stripe `POST /refunds`, and `POST /alerts`) require a valid `Idempotency-Key` header before retrying. Retrying a mutating request without an idempotency key can cause duplicate financial charges or duplicate alerts.
"""

# File E4: billing_glossary.md (Hard-negative / Decoy document)
def generate_billing_glossary():
    return """## Overview
This glossary defines common billing and payment terms used across Archon Copilot's e-commerce domain. It is a reference document for non-technical stakeholders, business analysts, and support staff to understand financial domain terminology and business concepts.

## Charge
A charge is a one-time debit from a customer's payment method (credit card, bank account, digital wallet) for goods or services rendered. A charge is considered complete when the payment processor confirms settlement through the card network and funds are transferred into the merchant acquiring account.

## Refund
A refund is the return of a previously collected payment to the customer's original payment method. Refunds can be full (the entire charge amount) or partial (a specified portion). Refunds are initiated by the merchant and may take 5–10 business days to appear on the customer's statement.

## Idempotency
Idempotency is the property of an operation whereby performing it multiple times produces the same result as performing it once. In payment processing, idempotency prevents accidental double charges or double refunds caused by network retries, connection timeouts, or duplicate user button presses.

## Chargeback
A chargeback occurs when a customer disputes a charge directly with their bank or card issuer rather than contacting the merchant. Unlike a refund (which is initiated voluntarily by the merchant), a chargeback is forced by the financial institution and may result in an administrative penalty fee for the merchant.

## Payment Intent
A Payment Intent represents the lifecycle of a payment collection attempt, tracking its state from creation through confirmation or failure. It is an abstraction used by modern payment processors to handle complex payment flows such as multi-factor authentication, 3D Secure verification, and delayed capture.
"""


# ==========================================
# GENERATION MANIFEST & EXECUTION
# ==========================================

GENERATE = {
    # Existing 4 files
    "stripe_full_openapi.yaml": generate_stripe_full_openapi,
    "sendgrid_swagger_2.json": generate_sendgrid_swagger_2,
    "slack_dev_guide.md": generate_slack_dev_guide,
    "twilio_postman_collection.json": generate_twilio_postman_collection,

    # Domain A: E-Commerce & Notifications
    "order_management_api.yaml": generate_order_management_api,
    "checkout_architecture_guide.md": generate_checkout_architecture_guide,

    # Domain B: Incident Alerting
    "alerting_service_api.yaml": generate_alerting_service_api,
    "incident_response_workflow.md": generate_incident_response_workflow,

    # Domain C: CI/CD & Version Control
    "github_webhooks_api.yaml": generate_github_webhooks_api,
    "ci_cd_deployment_guide.md": generate_ci_cd_deployment_guide,

    # Domain D: Support & Ticketing
    "zendesk_tickets_api.yaml": generate_zendesk_tickets_api,
    "customer_support_workflow.md": generate_customer_support_workflow,

    # Domain E: Cross-Cutting Concerns
    "global_security_policies.md": generate_global_security_policies,
    "api_gateway_routing.md": generate_api_gateway_routing,
    "api_error_codes.md": generate_api_error_codes,
    "billing_glossary.md": generate_billing_glossary,
}

if __name__ == "__main__":
    print(f"Generating {len(GENERATE)} dataset files in '{dataset_dir}'...")
    for filename, generator_func in GENERATE.items():
        content = generator_func()
        file_path = os.path.join(dataset_dir, filename)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  [+] Generated: {filename}")
    print("\nDataset augmentation successfully generated.")
