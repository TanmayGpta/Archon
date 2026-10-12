# RAG Evaluation Dataset Augmentation Plan
> **Status:** Approved for Execution  
> **Target:** `dataset/` directory at the project root  
> **Scope:** Lab 4 — RAG Pipeline Evaluation (Exercises 2, 3, 5, 6). Excludes the Archon Agent IDE.

---

## 1. Objective

Expand the knowledge base (`dataset/`) to enable **systematic evaluation** of the Archon RAG pipeline's multi-stage hybrid retrieval (BM25 + Dense Vector + MS-Marco Cross-Encoder). The augmented dataset is designed to:

1. Force **multi-file, cross-document reasoning** — the correct answer to many questions requires synthesising information from both an OpenAPI spec *and* a Markdown integration guide.
2. Create **measurable retrieval failure scenarios** — deliberate "hard-negative" decoy documents exercise the failure modes that Lab 4 Exercise 5 requires you to identify and analyse.
3. Produce **multi-hop queries** — at least one document class requires chaining three sources to form a complete answer, directly testing Lab 4 Exercise 6.
4. **Stress each retrieval layer** independently — some questions are keyword-exact (BM25 wins), some are semantic paraphrases (dense wins), some require deep pairwise attention (cross-encoder wins). This enables the quantitative comparison in Lab 4 Exercise 3.

---

## 2. System Constraints (Read Before Generating Any File)

These are hard constraints derived from the live service code. Violating them causes silent misparsing — the file ingests without error but produces garbage chunks.

### 2.1 Ingestion Service — Supported Formats & Dispatch Logic

File: `services/ingestion_service/app/chunker.py` — `chunk_file_content()`

| Extension | Condition | Handler |
|---|---|---|
| `.yaml` / `.yml` | Root dict must contain `paths` key | `chunk_openapi_spec()` — one chunk per HTTP method/path |
| `.json` | Root dict contains `paths` | `chunk_openapi_spec()` |
| `.json` | Root dict contains `info` AND `item` | `chunk_postman_collection()` |
| `.md` / `.txt` | Any content | `chunk_markdown_doc()` |
| Anything else | — | Single plain-text fallback chunk |

> **Rule:** All new API specs MUST be `.yaml` format with a root-level `paths` key. Do NOT introduce new `.json` OpenAPI specs — the dispatcher would route them through the Postman branch if `item` is present, or miss them entirely otherwise.

### 2.2 Markdown Chunker — `##`-Only Splitting

The `chunk_markdown_doc()` function splits **exclusively on `\n## `** (second-level headers):

```python
sections = content.split('\n## ')
```

**Consequence:** Any `###` subsection is NOT split into its own chunk — it stays merged with its parent `##` section. For dense workflow guides, this creates chunks that are too large and topically mixed, harming retrieval precision.

> **Rule:** All new `.md` files MUST use only `##` headers for structural sections. Do NOT use `###` or deeper. Each `##` section should be logically atomic — covering exactly one concept, step, or component — so the resulting chunk is retrievable on its own.

### 2.3 RAG Service — Metadata Fields

File: `services/rag_service/app/search_engine.py` — `ingest_chunks()`

Each chunk stored in ChromaDB carries: `source`, `api_title`, `endpoint`, `hash`. The chunker automatically populates these. No action needed, but note that the `endpoint` field for Markdown chunks is set to the `##` header string — keep `##` headers short and descriptive, as they serve as the chunk's display label in the RAG inspector UI.

### 2.4 Dataset Directory

The ingestion service scans `dataset/` (resolved via `DATASET_DIR` env var, defaults to project root `dataset/`). Drop all new files directly into this directory — no subdirectories.

---

## 3. Cross-Reference Hook Rules (Critical for Evaluation Validity)

For multi-file questions to work, paired files must share **explicit textual anchors**. Without these, BM25 cannot join documents, and the evaluation cannot distinguish between a retrieval success and a lucky semantic match.

For every domain, apply the following rules when writing file content:

1. **Exact endpoint paths** — The Markdown guide MUST mention the exact HTTP method + path string that appears in the paired YAML spec (e.g., if the YAML has `POST /orders`, the guide must say `POST /orders`, not "the order creation endpoint").
2. **Shared field names** — Use the same parameter/body field names verbatim across the paired files (e.g., `charge_id`, `Idempotency-Key`).
3. **One paraphrase per guide** — Deliberately use one synonym or paraphrase for a concept that the YAML spec names precisely. This creates a question that BM25 will fail to answer (keyword miss) but the dense/cross-encoder layer will succeed on. This is intentional — it produces the retrieval layer comparison data needed for Exercise 3.

---

## 4. File Manifest

The current `dataset/` contains these 9 files (the "existing corpus"):

| File | Type | APIs Covered |
|---|---|---|
| `stripe_v1.yaml` | OpenAPI 3.x YAML | Stripe: `/charges`, `/refunds` |
| `stripe_full_openapi.yaml` | OpenAPI 3.x YAML | Stripe: `/customers`, `/payment_intents`, `/subscriptions`, `/invoices` |
| `payments_v2.yaml` | OpenAPI 3.x YAML | Internal Payments: `/v2/payments/charge`, `/v2/payments/refund` |
| `sendgrid_v3.yaml` | OpenAPI 3.x YAML | SendGrid: email send |
| `sendgrid_swagger_2.json` | Swagger 2.0 JSON | SendGrid: `/mail/send`, `/templates` |
| `slack_v1.yaml` | OpenAPI 3.x YAML | Slack: chat endpoints |
| `slack_dev_guide.md` | Markdown | Slack auth, `POST /api/chat.postMessage`, `GET /api/users.list` |
| `twilio_v2010.yaml` | OpenAPI 3.x YAML | Twilio: SMS/Calls |
| `twilio_postman_collection.json` | Postman Collection | Twilio: Send SMS, Fetch Call Logs |

**12 new files** are to be created across 5 domains. Each domain is described below with the exact content specification for each file.

---

## 5. New Files — Full Content Specification

### Domain A: E-Commerce & Notifications
*Cross-references existing: `stripe_v1.yaml`, `stripe_full_openapi.yaml`, `sendgrid_v3.yaml`*

---

#### File A1: `order_management_api.yaml`
**Type:** OpenAPI 3.x YAML  
**Purpose:** Internal microservice for order placement and refund initiation. Contains endpoints that the checkout guide (A2) narrates. Links to Stripe via `charge_id` field.

**Required endpoints (minimum 4):**
- `POST /orders` — Place a new order. Body: `customer_id` (string), `items` (array), `total_amount` (integer, cents). Response: `order_id`, `status: "pending"`.
- `GET /orders/{order_id}` — Retrieve order status. Path param: `order_id`.
- `POST /orders/{order_id}/refund` — Initiate a refund for an order. Body: `charge_id` (string, **the Stripe charge ID**), `amount` (integer), `reason` (enum: `duplicate`, `fraudulent`, `requested_by_customer`). Requires `Idempotency-Key` header.
- `GET /orders/{order_id}/status` — Poll fulfilment status.

**Cross-reference hooks to embed:**
- Field `charge_id` must appear — bridges to `stripe_v1.yaml`'s `POST /refunds` which also uses `charge_id`.
- Field `Idempotency-Key` header must appear — matches `stripe_v1.yaml` and `payments_v2.yaml`.
- Response body should include `notification_email` field to bridge to SendGrid.

---

#### File A2: `checkout_architecture_guide.md`
**Type:** Markdown (flat `##` sections only)  
**Purpose:** Integration guide narrating the full checkout flow. Must use exact endpoint paths from `order_management_api.yaml`, `stripe_v1.yaml`, and `sendgrid_v3.yaml`.

**Required `##` sections (minimum 5):**

1. `## Overview` — One paragraph describing the checkout system: "The Order Management Service orchestrates two external APIs: Stripe for payment collection and SendGrid for receipt delivery."
2. `## Step 1: Place Order via POST /orders` — Describes calling `POST /orders`, the required fields, and that it returns a `order_id` and `status: pending`.
3. `## Step 2: Charge the Customer via Stripe POST /charges` — Explains that after order creation, the service calls Stripe's `POST /charges` endpoint with `amount` and `currency`. On success, Stripe returns a `charge_id` which is stored against the order.
4. `## Step 3: Trigger Refund via POST /orders/{order_id}/refund` — Explains that refunds require passing the Stripe `charge_id` back to `POST /orders/{order_id}/refund`, which internally calls Stripe's `POST /refunds`. The `Idempotency-Key` header is mandatory on both calls to prevent double-refunds. *(Paraphrase zone: also call this header "the duplicate-prevention key" once — for dense retrieval testing.)*
5. `## Step 4: Send Receipt via SendGrid` — After payment, the service sends a transactional email via SendGrid's email send endpoint. Includes the order summary and `charge_id` reference number.
6. `## Error Handling` — Describes what happens when Stripe's `POST /charges` returns a non-200: the order status is set to `failed`, no SendGrid email is sent, and the client receives a `402 Payment Required` response.

---

### Domain B: Incident Alerting
*Cross-references existing: `twilio_v2010.yaml`, `twilio_postman_collection.json`, `slack_v1.yaml`, `slack_dev_guide.md`*

---

#### File B1: `alerting_service_api.yaml`
**Type:** OpenAPI 3.x YAML  
**Purpose:** Internal alerting microservice consumed by monitoring tools to fire notifications. Links to Twilio (SMS) and Slack (channel messages).

**Required endpoints (minimum 4):**
- `POST /alerts` — Trigger a new alert. Body: `severity` (enum: `critical`, `warning`, `info`), `message` (string), `service_name` (string). Response: `alert_id`, `channels_notified` (array).
- `GET /alerts/{alert_id}` — Fetch alert delivery status.
- `POST /alerts/{alert_id}/escalate` — Escalate an existing unacknowledged alert after a timeout. Body: `escalation_reason` (string).
- `POST /alerts/test` — Send a test notification to all configured channels.

**Cross-reference hooks to embed:**
- Response field `channels_notified` values must be `"twilio_sms"` and `"slack_channel"` — exact strings referenced in the incident guide (B2).
- `severity: critical` must be mentioned — the guide (B2) explains that only `critical` severity triggers Twilio SMS.

---

#### File B2: `incident_response_workflow.md`
**Type:** Markdown (flat `##` sections only)  
**Purpose:** Explains the decision logic for routing alerts to Twilio vs. Slack.

**Required `##` sections (minimum 5):**

1. `## Overview` — "The Alerting Service evaluates each `POST /alerts` request and decides whether to dispatch via Twilio SMS, Slack channel message, or both, based on alert severity."
2. `## Severity-Based Routing Rules` — Table or bullet list: `critical` severity → Twilio SMS via `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` AND Slack `POST /api/chat.postMessage`; `warning` → Slack only; `info` → logged, no external notification.
3. `## Twilio SMS Dispatch` — Explains the Twilio call: uses `Basic Auth`, sends to the on-call phone number. The body param `Body` contains the alert `message`. *(Paraphrase zone: also refer to Twilio as "the SMS gateway" once.)*
4. `## Slack Channel Dispatch` — Explains the Slack call: uses `Bearer xoxb-` token (from `slack_dev_guide.md`), sends to `#incidents` channel using the `channel` and `text` fields of `POST /api/chat.postMessage`.
5. `## Escalation Flow` — After 15 minutes without acknowledgement, `POST /alerts/{alert_id}/escalate` is called, which re-fires both Twilio and Slack regardless of severity.
6. `## Alert Acknowledgement` — A responder must acknowledge via the monitoring dashboard, which internally calls `GET /alerts/{alert_id}` and marks the alert resolved.

---

### Domain C: CI/CD & Version Control
*This is a new domain — no existing files. Both files below are new.*

---

#### File C1: `github_webhooks_api.yaml`
**Type:** OpenAPI 3.x YAML  
**Purpose:** Mock OpenAPI spec for a GitHub Webhooks receiver microservice. The CI/CD guide (C2) references these endpoints.

**Required endpoints (minimum 4):**
- `POST /webhooks/github/push` — Receives a push event payload. Body: `repository` (object with `name`, `full_name`), `ref` (string, branch name, e.g. `refs/heads/main`), `commits` (array), `pusher` (object with `name`, `email`).
- `POST /webhooks/github/pull_request` — Receives a PR event. Body: `action` (enum: `opened`, `merged`, `closed`), `pull_request` (object with `number`, `title`, `merged` boolean), `repository` (object).
- `GET /webhooks/github/deliveries` — List recent webhook delivery attempts with status.
- `POST /webhooks/github/ping` — GitHub's initial handshake event. Must return `200 OK`.

**Cross-reference hooks to embed:**
- Field `ref` with value pattern `refs/heads/main` — referenced in C2 as the trigger for production deployments.
- Field `pusher.email` — referenced in C2 as the address used for deployment notification emails.

---

#### File C2: `ci_cd_deployment_guide.md`
**Type:** Markdown (flat `##` sections only)  
**Purpose:** Narrates the full automated pipeline triggered by a GitHub push.

**Required `##` sections (minimum 6):**

1. `## Overview` — "A push to the `main` branch triggers the full CI/CD pipeline. The pipeline uses the GitHub Webhooks receiver, the internal Alerting Service, and SendGrid for deployment outcome notifications."
2. `## Trigger: Push Event on main Branch` — Describes that `POST /webhooks/github/push` receives the event. The pipeline only activates when `ref` equals `refs/heads/main`. Feature branch pushes are ignored.
3. `## CI Stage: Running Tests` — Pipeline runs automated test suite. If tests fail, the deployment is aborted.
4. `## CD Stage: Deployment` — On test pass, the deployment is executed. The `pusher.name` from the webhook payload is logged as the deployer.
5. `## Success Notification via Alerting Service` — On successful deployment, the pipeline calls `POST /alerts` (from `alerting_service_api.yaml`) with `severity: info` and `message` containing the repository name. This results in a Slack notification to `#deployments`. *(Paraphrase zone: also refer to this as "posting a deployment status message" once.)*
6. `## Failure Notification via Alerting Service` — On failure, calls `POST /alerts` with `severity: critical`, which triggers both a Twilio SMS to the on-call engineer AND a Slack message per the incident routing rules.
7. `## Pull Request Merge Handling` — When `POST /webhooks/github/pull_request` fires with `action: merged` and `merged: true`, the pipeline treats it identically to a `main` branch push and begins the deployment flow.

---

### Domain D: Support & Ticketing
*Cross-references existing: `stripe_v1.yaml`, `sendgrid_v3.yaml`*

---

#### File D1: `zendesk_tickets_api.yaml`
**Type:** OpenAPI 3.x YAML  
**Purpose:** Mock Zendesk ticketing API. Links to Stripe refunds and SendGrid emails via the support workflow guide (D2).

**Required endpoints (minimum 4):**
- `POST /api/v2/tickets` — Create a support ticket. Body: `subject` (string), `comment` (object with `body` string), `requester` (object with `name`, `email`), `tags` (array of strings, e.g. `["refund_request"]`). Requires `Authorization: Bearer {api_token}` header.
- `GET /api/v2/tickets/{ticket_id}` — Retrieve ticket details. Response includes `status` (enum: `new`, `open`, `pending`, `solved`, `closed`), `tags`, `custom_fields`.
- `PUT /api/v2/tickets/{ticket_id}` — Update a ticket. Body: `status`, `comment` (internal note).
- `GET /api/v2/tickets/{ticket_id}/comments` — List all comments/notes on a ticket.

**Cross-reference hooks to embed:**
- `tags` array with value `"refund_request"` — the support guide (D2) filters tickets by this tag to initiate Stripe refunds.
- `requester.email` field — used as the recipient address for the SendGrid confirmation email in D2.

---

#### File D2: `customer_support_workflow.md`
**Type:** Markdown (flat `##` sections only)  
**Purpose:** Describes the multi-system refund support workflow spanning Zendesk, Stripe, and SendGrid.

**Required `##` sections (minimum 5):**

1. `## Overview` — "Refund-related support tickets are triaged by the Support Workflow Engine, which links a Zendesk ticket to a Stripe refund and closes the loop with a SendGrid confirmation email."
2. `## Step 1: Ticket Identification` — The engine polls `GET /api/v2/tickets/{ticket_id}` and filters for tickets with `tags` containing `"refund_request"`. When found with `status: open`, the refund workflow begins.
3. `## Step 2: Issue Stripe Refund via POST /refunds` — Using the `charge_id` stored in the ticket's `custom_fields`, the engine calls Stripe's `POST /refunds` with the `charge_id` and optionally a partial `amount`. The `Idempotency-Key` header is set to the `ticket_id` to prevent duplicate refunds. *(Paraphrase zone: also refer to the Stripe refund call as "reversing the original payment" once.)*
4. `## Step 3: Send Confirmation Email via SendGrid` — After a successful Stripe refund, the engine sends a confirmation email to `requester.email` via SendGrid's email send endpoint. The email body includes the `ticket_id` and refund amount.
5. `## Step 4: Close the Ticket` — The engine calls `PUT /api/v2/tickets/{ticket_id}` with `status: solved` and adds an internal comment noting the Stripe refund reference.
6. `## Error Handling` — If Stripe's `POST /refunds` fails (e.g., `charge_id` not found), the ticket status is updated to `pending` and an internal comment is added. No SendGrid email is sent. The agent must manually resolve.

---

### Domain E: Cross-Cutting Concerns
*Referenced by all domains above. These files must be generated before evaluation questions are drafted.*

---

#### File E1: `global_security_policies.md`
**Type:** Markdown (flat `##` sections only)  
**Purpose:** Defines the authentication scheme used by each service in the ecosystem. Must explicitly name and reconcile all auth schemes present in the existing corpus and new files. This is the key document for cross-spanning auth questions.

**Required `##` sections (minimum 6):**

1. `## Overview` — "This policy document defines the authentication schemes required across all internal and external APIs in the Archon Copilot platform. All services MUST comply."
2. `## Bearer Token (JWT) Authentication` — Used by: Order Management API (`POST /orders`, all endpoints), Zendesk Tickets API (header: `Authorization: Bearer {api_token}`), Slack API (header: `Authorization: Bearer xoxb-{token}`). Format: `Authorization: Bearer <token>`.
3. `## HTTP Basic Authentication` — Used by: Twilio Communication API (header: `Authorization: Basic <base64(AccountSid:AuthToken)>`). No other internal service may use Basic Auth except Twilio integration adapters.
4. `## API Key Authentication (Stripe)` — Stripe uses a Bearer token that is actually a secret API key (`sk_live_...`), passed in the `Authorization` header. This is distinct from short-lived JWTs. The `Idempotency-Key` header is a separate, mandatory safety header on all mutating Stripe and Order Management calls — it is NOT an authentication mechanism.
5. `## Prohibited Schemes` — API Key passed as a query parameter (`?api_key=`) is PROHIBITED. OAuth2 implicit flow is PROHIBITED. All new services MUST use Bearer JWT.
6. `## Standard Error Response Format` — All internal APIs must return errors as `{"error": {"code": <string>, "message": <string>, "http_status": <integer>}}`. External APIs (Stripe, SendGrid, Twilio, Slack) return their own error formats — callers must map these to the internal format.

---

#### File E2: `api_gateway_routing.md`
**Type:** Markdown (flat `##` sections only)  
**Purpose:** Describes how the API Gateway routes external requests to internal services, including rate limiting and authentication pass-through.

**Required `##` sections (minimum 5):**

1. `## Overview` — "The central API Gateway (running at `api.archon.internal`) is the single ingress point for all external traffic. It routes to the Order Management API and the Alerting Service API, and enforces rate limiting."
2. `## Route Table` — Table: external path prefix → internal service and base URL. Includes: `/v1/orders/*` → Order Management API `POST /orders`, `GET /orders/{order_id}`, etc.; `/v1/alerts/*` → Alerting Service `POST /alerts`, `POST /alerts/{alert_id}/escalate`. The GitHub Webhooks receiver is NOT exposed through the gateway — it is triggered directly by GitHub.
3. `## Authentication Pass-Through` — The gateway validates the `Authorization: Bearer` JWT token on all requests before forwarding. It strips and replaces the token with an internal service token. Stripe, Twilio, and SendGrid are called directly by internal services, NOT through the gateway.
4. `## Rate Limiting Rules` — `POST /orders`: 100 requests/minute per `customer_id`. `POST /alerts`: 20 requests/minute per `service_name`. Exceeding limits returns `429 Too Many Requests`.
5. `## Zendesk and CI/CD Exclusions` — The Zendesk Tickets API and GitHub Webhooks API are internal-only services not exposed through the gateway. They communicate via internal service mesh only.

---

#### File E3: `api_error_codes.md` *(Multi-Hop Bridge Document)*
**Type:** Markdown (flat `##` sections only)  
**Purpose:** Canonical error code reference that bridges across all API specs. This is the multi-hop bridge document. A question like "What should a client do when the Order Management API returns 429?" requires (1) knowing which service is involved, (2) retrieving the rate limiting rule from `api_gateway_routing.md`, and (3) finding the recovery strategy here.

**Required `##` sections (minimum 5):**

1. `## Overview` — "This document is the canonical reference for all HTTP error codes returned by internal services and their required client handling strategies."
2. `## 4xx Client Errors` — Table with columns: `HTTP Code`, `Meaning`, `Returned By`, `Client Action Required`. Include: `400 Bad Request` (Order Management — missing required fields, re-submit with corrected body), `401 Unauthorized` (any service — invalid or expired Bearer token, re-authenticate), `402 Payment Required` (Order Management — Stripe charge failed, notify user), `404 Not Found` (any service — resource does not exist, do not retry), `409 Conflict` (Order Management — duplicate `Idempotency-Key` with different body, check if original succeeded), `422 Unprocessable Entity` (Alerting Service — invalid severity value, correct the enum), `429 Too Many Requests` (API Gateway — rate limit hit, back off for 60 seconds before retrying).
3. `## 5xx Server Errors` — Table: `500 Internal Server Error` (any service — retry with exponential backoff, max 3 attempts), `502 Bad Gateway` (API Gateway — upstream service unreachable, alert the on-call team via `POST /alerts` with `severity: critical`), `503 Service Unavailable` (any service — retry after `Retry-After` header value).
4. `## External API Error Mapping` — How external API errors map to internal format: Stripe `card_error` → internal `402`; Twilio error `21211` (invalid To number) → internal `400`; SendGrid `403` (unverified sender) → internal `500` (must fix configuration).
5. `## Idempotency and Retry Safety` — Only `GET` requests and requests with a valid `Idempotency-Key` header are safe to retry. `POST /orders`, `POST /orders/{order_id}/refund`, `POST /refunds` (Stripe), and `POST /alerts` all require `Idempotency-Key` before retrying.

---

#### File E4: `billing_glossary.md` *(Hard-Negative / Decoy Document)*
**Type:** Markdown (flat `##` sections only)  
**Purpose:** A plain-English glossary of billing and payment terms. This is the **hard-negative document** — it shares high surface vocabulary with payment/refund queries but contains **no actionable API information** (no endpoints, no field names, no code). A well-functioning retriever should deprioritise this document in favour of `stripe_v1.yaml` or `order_management_api.yaml` for API-specific questions. If it surfaces first, that is a retrieval failure worth documenting in Exercise 5.

> **Important:** Do NOT include any HTTP method, endpoint path, or parameter field name in this file. Pure business definitions only.

**Required `##` sections (minimum 5):**

1. `## Overview` — "This glossary defines common billing and payment terms used across Archon Copilot's e-commerce domain. It is a reference document for non-technical stakeholders."
2. `## Charge` — "A charge is a one-time debit from a customer's payment method (credit card, bank account, etc.) for goods or services rendered. A charge is considered complete when the payment processor confirms settlement."
3. `## Refund` — "A refund is the return of a previously collected payment to the customer's original payment method. Refunds can be full (the entire charge amount) or partial (a specified portion). Refunds are initiated by the merchant and may take 5–10 business days to appear on the customer's statement."
4. `## Idempotency` — "Idempotency is the property of an operation whereby performing it multiple times produces the same result as performing it once. In payment processing, idempotency prevents accidental double charges or double refunds caused by network retries."
5. `## Chargeback` — "A chargeback occurs when a customer disputes a charge directly with their bank or card issuer. Unlike a refund (initiated by the merchant), a chargeback is forced by the financial institution and may result in a penalty fee for the merchant."
6. `## Payment Intent` — "A Payment Intent represents the lifecycle of a payment collection attempt, tracking its state from creation through confirmation or failure. It is an abstraction used by modern payment processors to handle complex payment flows such as 3D Secure authentication."

---

## 6. Evaluation Question Bank (20–30 Questions)

These questions are designed to be used for **all three LLM models** in Lab 4 Exercises 2 and 3. Each question is tagged by the retrieval complexity it tests.

Tags:
- `[SINGLE]` — Answerable from one file
- `[CROSS-2]` — Requires exactly 2 files
- `[CROSS-3+]` — Requires 3 or more files
- `[FAILURE]` — Designed to cause a retrieval failure for Exercise 5 analysis
- `[BM25]` — Keyword-exact, favours BM25
- `[DENSE]` — Paraphrase-based, favours dense/cross-encoder

---

### Group 1: Single-File Retrieval (Baseline)

| # | Question | Expected Source File(s) | Tag |
|---|---|---|---|
| Q1 | What fields are required in the request body to create a new order? | `order_management_api.yaml` | `[SINGLE][BM25]` |
| Q2 | What authentication scheme does the Twilio API use? | `twilio_v2010.yaml` or `global_security_policies.md` | `[SINGLE][BM25]` |
| Q3 | How do I send a Slack message to a channel? | `slack_dev_guide.md` or `slack_v1.yaml` | `[SINGLE][BM25]` |
| Q4 | What happens when an alert is escalated? | `incident_response_workflow.md` | `[SINGLE][DENSE]` |
| Q5 | List all the endpoints exposed by the Zendesk Tickets API. | `zendesk_tickets_api.yaml` | `[SINGLE][BM25]` |
| Q6 | Which APIs prohibit passing the API key as a query parameter? | `global_security_policies.md` | `[SINGLE][BM25]` |
| Q7 | What does a 429 error mean and what should the client do? | `api_error_codes.md` | `[SINGLE][BM25]` |

### Group 2: Two-File Cross-Referencing

| # | Question | Expected Source File(s) | Tag |
|---|---|---|---|
| Q8 | What is the exact Stripe endpoint called when a customer requests a refund through the Order Management API? | `order_management_api.yaml` + `checkout_architecture_guide.md` | `[CROSS-2][DENSE]` |
| Q9 | What header must be included when initiating a refund to prevent duplicate charges, and which services require it? | `checkout_architecture_guide.md` + `api_error_codes.md` | `[CROSS-2][BM25]` |
| Q10 | When a critical alert fires, what Twilio API endpoint is called and what does the request body contain? | `alerting_service_api.yaml` + `incident_response_workflow.md` | `[CROSS-2][CROSS-3+]` |
| Q11 | After a Zendesk ticket tagged as a refund request is resolved, what external APIs are called and in what order? | `zendesk_tickets_api.yaml` + `customer_support_workflow.md` | `[CROSS-2][DENSE]` |
| Q12 | Which internal services are NOT routed through the API Gateway, and why? | `api_gateway_routing.md` + `github_webhooks_api.yaml` (or `zendesk_tickets_api.yaml`) | `[CROSS-2][DENSE]` |
| Q13 | How is the `pusher.email` field from a GitHub push event used later in the deployment pipeline? | `github_webhooks_api.yaml` + `ci_cd_deployment_guide.md` | `[CROSS-2][BM25]` |
| Q14 | What SendGrid endpoint is used to send a receipt after a successful order, and what triggers the call? | `checkout_architecture_guide.md` + `sendgrid_v3.yaml` | `[CROSS-2][DENSE]` |

### Group 3: Multi-File / Multi-Hop (Lab 4 Exercise 6)

| # | Question | Expected Source File(s) | Tag |
|---|---|---|---|
| Q15 | Trace the complete flow from a GitHub push to `main` to a Slack notification appearing in `#deployments`. Name every API endpoint called, in order. | `github_webhooks_api.yaml` + `ci_cd_deployment_guide.md` + `alerting_service_api.yaml` + `incident_response_workflow.md` + `slack_v1.yaml` | `[CROSS-3+][DENSE]` |
| Q16 | If a deployment fails, which APIs are called to notify the team, and which auth scheme does each one use? | `ci_cd_deployment_guide.md` + `alerting_service_api.yaml` + `global_security_policies.md` | `[CROSS-3+][DENSE]` |
| Q17 | A customer requests a refund via the support portal. Describe the full sequence of calls, starting from ticket creation to the email confirmation, naming every endpoint and field. | `zendesk_tickets_api.yaml` + `customer_support_workflow.md` + `stripe_v1.yaml` + `sendgrid_v3.yaml` | `[CROSS-3+][DENSE]` |
| Q18 | Which components or services could be affected if the `Idempotency-Key` requirement were removed from the Order Management API? | `order_management_api.yaml` + `checkout_architecture_guide.md` + `api_error_codes.md` + `global_security_policies.md` | `[CROSS-3+][DENSE]` |
| Q19 | What is the difference between how a `warning` alert and a `critical` alert are handled, end to end, including which external APIs are invoked? | `alerting_service_api.yaml` + `incident_response_workflow.md` + `twilio_v2010.yaml` + `slack_dev_guide.md` | `[CROSS-3+][DENSE]` |

### Group 4: Retrieval Failure / Decoy (Lab 4 Exercise 5)

| # | Question | Expected Source | Likely Failure | Tag |
|---|---|---|---|---|
| Q20 | What is a refund? | `billing_glossary.md` | RAG may retrieve `stripe_v1.yaml` instead — no harmful hallucination but wrong source | `[FAILURE][BM25]` |
| Q21 | How do I issue a refund to a customer? | `stripe_v1.yaml` + `order_management_api.yaml` | RAG may surface `billing_glossary.md` (decoy) instead — answer will be non-actionable | `[FAILURE][DENSE]` |
| Q22 | What is idempotency? | `billing_glossary.md` (definition) + `api_error_codes.md` (recovery guidance) | LLM may hallucinate a code example not present in either source | `[FAILURE][DENSE]` |
| Q23 | Which file handles payment authentication? | `global_security_policies.md` | Dense retrieval may incorrectly surface `stripe_v1.yaml`'s `bearerAuth` component instead | `[FAILURE][BM25]` |

### Group 5: Code Generation / Synthesis (Lab 4 Exercise 2)

| # | Question | Tag |
|---|---|---|
| Q24 | Write a Python `requests` snippet to place a new order via `POST /orders` with all required fields. | `[SINGLE]` |
| Q25 | Write a Python function that first creates a Stripe charge, then records the `charge_id` in an order refund request. | `[CROSS-2]` |
| Q26 | Write a unit test for a function that calls `POST /alerts` and asserts that the response contains a `channels_notified` array. | `[SINGLE]` |

---

## 7. Implementation Instructions

### Step 1 — Extend the Dataset Generator

Extend `scripts/b2b_dataset_generator.py` (NOT `scripts/dataset_generator.py`) with new sections for each domain. Use the existing pattern: write Python dictionaries for YAML/JSON files, use triple-quoted strings for Markdown files, and call `yaml.dump()` / `f.write()` to emit files into `dataset/`.

Add a `GENERATE` dict at the top mapping filename → generation function, then loop at the end:
```python
for filename, content in files_to_write.items():
    with open(os.path.join(dataset_dir, filename), 'w') as f:
        f.write(content)
```

### Step 2 — Validate Chunker Compatibility Before Full Ingestion

Before ingesting the full dataset, run a dry-parse check by calling the ingestion service's `POST /api/parse-file` endpoint on each new file individually (the service runs on port `8002`). Verify:
- YAML files produce `chunk_count >= 4` (one per endpoint minimum).
- Markdown files produce `chunk_count` equal to the number of `##` sections in the file.
- `billing_glossary.md` produces chunks but each chunk's `text` does NOT contain any HTTP method strings (since it's a decoy).

### Step 3 — Ingest into ChromaDB

Once all files pass validation, trigger full ingestion:
```
POST http://localhost:8002/api/parse-dataset
```
The RAG service at port `8001` will auto-sync on next startup (or if ChromaDB is cleared). The ChromaDB collection is `api_docs_collection` as defined in `services/rag_service/app/config.py`.

### Step 4 — Run Evaluation Questions

Use the 26 questions from Section 6. For each question, record the full triple:
```
QUESTION → RETRIEVED CONTEXT (all 3 streams: BM25, Dense, Cross-Encoder) → LLM RESPONSE
```
Tag each result with the expected source files and whether the retrieval was: ✅ Correct, ⚠️ Partial, ❌ Wrong source, 🔥 Hallucinated.

---

## 8. File Summary Table

| Filename | Type | Domain | New/Existing | Key Cross-References |
|---|---|---|---|---|
| `order_management_api.yaml` | OpenAPI YAML | A — E-Commerce | **NEW** | `stripe_v1.yaml` (charge_id), `sendgrid_v3.yaml` |
| `checkout_architecture_guide.md` | Markdown | A — E-Commerce | **NEW** | `order_management_api.yaml`, `stripe_v1.yaml`, `sendgrid_v3.yaml` |
| `alerting_service_api.yaml` | OpenAPI YAML | B — Alerting | **NEW** | `twilio_v2010.yaml`, `slack_v1.yaml` |
| `incident_response_workflow.md` | Markdown | B — Alerting | **NEW** | `alerting_service_api.yaml`, `twilio_postman_collection.json`, `slack_dev_guide.md` |
| `github_webhooks_api.yaml` | OpenAPI YAML | C — CI/CD | **NEW** | `alerting_service_api.yaml` (via guide) |
| `ci_cd_deployment_guide.md` | Markdown | C — CI/CD | **NEW** | `github_webhooks_api.yaml`, `alerting_service_api.yaml`, `incident_response_workflow.md` |
| `zendesk_tickets_api.yaml` | OpenAPI YAML | D — Support | **NEW** | `stripe_v1.yaml`, `sendgrid_v3.yaml` |
| `customer_support_workflow.md` | Markdown | D — Support | **NEW** | `zendesk_tickets_api.yaml`, `stripe_v1.yaml`, `sendgrid_v3.yaml` |
| `global_security_policies.md` | Markdown | E — Cross-cutting | **NEW** | All API specs |
| `api_gateway_routing.md` | Markdown | E — Cross-cutting | **NEW** | `order_management_api.yaml`, `alerting_service_api.yaml` |
| `api_error_codes.md` | Markdown | E — Cross-cutting | **NEW** | All services, multi-hop bridge |
| `billing_glossary.md` | Markdown | E — Decoy | **NEW** | None (hard-negative) |
