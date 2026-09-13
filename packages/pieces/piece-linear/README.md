# `@frogbotai/piece-linear`

Manage Linear issues, projects, comments, and webhook events.

## Usage

```ts
import { createLinear } from '@frogbotai/piece-linear';

export const linear = createLinear({ auth: { apiKey: process.env.LINEAR_API_KEY! } });
```

## Actions

| Upstream action slug    | Previous wrapper export | Native action     | Notes                                                |
| ----------------------- | ----------------------- | ----------------- | ---------------------------------------------------- |
| `linear_create_issue`   | `linearCreateIssue`     | `createIssue`     |                                                      |
| `linear_update_issue`   | `linearUpdateIssue`     | `updateIssue`     |                                                      |
| `linear_create_project` | `linearCreateProject`   | `createProject`   |                                                      |
| `linear_update_project` | `linearUpdateProject`   | `updateProject`   | Previously exposed but omitted from `linearActions`. |
| `linear_create_comment` | `linearCreateComment`   | `createComment`   |                                                      |
| `rawGraphqlQuery`       | `rawGraphqlQuery`       | `rawGraphqlQuery` |                                                      |

## Triggers

Set the factory's optional `webhookSecret` to enable webhook triggers. Actions continue to work without it; trigger subscription creation requires it.

```ts
export const linear = createLinear({
  auth: { apiKey: process.env.LINEAR_API_KEY! },
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET!,
});
```

FrogBot passes this secret to Linear when creating each webhook. Incoming requests must have a valid `Linear-Signature` HMAC-SHA256 signature over the raw body and a signed body `webhookTimestamp` within ±60 seconds of server time. Missing or invalid signatures, secrets, or timestamps are rejected.

| Upstream trigger slug | Native trigger   | Type      | Notes                                                 |
| --------------------- | ---------------- | --------- | ----------------------------------------------------- |
| `new_comment`         | `commentCreated` | `webhook` | Optional team and author filters.                     |
| `new_issue`           | `issueCreated`   | `webhook` | Team-scoped.                                          |
| `updated_issue`       | `issueUpdated`   | `webhook` | Optional team scope.                                  |
| `removed_issue`       | `issueRemoved`   | `webhook` | Team-scoped.                                          |
| `new_project`         | `projectCreated` | `webhook` | Workspace-wide.                                       |
| `updated_project`     | `projectUpdated` | `webhook` | Status changes with optional team and status filters. |
| `removed_project`     | `projectRemoved` | `webhook` | Workspace-wide.                                       |
