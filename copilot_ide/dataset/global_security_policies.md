## Overview
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
