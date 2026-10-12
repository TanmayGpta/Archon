## Overview
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
