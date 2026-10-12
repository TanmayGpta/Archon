## Overview
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
