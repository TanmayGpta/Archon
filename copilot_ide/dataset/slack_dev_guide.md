# Slack API Developer Guide

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
