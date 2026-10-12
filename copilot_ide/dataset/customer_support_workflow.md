## Overview
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
