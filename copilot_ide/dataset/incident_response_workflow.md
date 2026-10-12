## Overview
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
