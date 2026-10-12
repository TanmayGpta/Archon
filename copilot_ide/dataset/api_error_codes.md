## Overview
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
