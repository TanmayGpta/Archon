## Overview
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
