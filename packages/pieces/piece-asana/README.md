# `@frogbotai/piece-asana`

Import Asana workspaces, projects, sections, tasks, comments and attachments, and create tasks, with a personal access token or Asana sign-in.

## Usage

```ts
import { createAsana } from '@frogbotai/piece-asana';

// An app-wide personal access token.
export const asana = createAsana({ auth: { accessToken: process.env.ASANA_TOKEN! } });

// Or each person signs in with Asana.
export const asanaForUsers = createAsana({
  oauth: {
    clientId: process.env.ASANA_CLIENT_ID!,
    clientSecret: process.env.ASANA_CLIENT_SECRET!,
  },
});
```

Sign-in asks for Asana's `default` scope (full permissions) with PKCE. A 429 is retried after `Retry-After`, up to 3 times.

## Actions

| Upstream action slug | Native action   | Notes                                                                           |
| -------------------- | --------------- | ------------------------------------------------------------------------------- |
| `create_task`        | `createTask`    | Sends the due date as `due_on`; an unknown tag throws instead of being dropped. |
| custom API call      | `customApiCall` | Paths under `https://app.asana.com/api/1.0`.                                    |

## Import reads

FrogBot additions for moving a whole workspace. Each takes `limit` (1–100, default 50) and `cursor`, and returns `{ data, pagination: { count, hasMore, nextCursor, limit } }`. Pass `nextCursor` back as `cursor` until it is `null`.

| Action               | Reads                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| `listWorkspaces`     | Workspaces and organizations.                                           |
| `listTeams`          | Teams in an organization.                                               |
| `listProjects`       | Projects in a workspace, optionally one team's, archived or active.     |
| `listSections`       | A project's sections.                                                   |
| `listUsers`          | Users in a workspace, with emails.                                      |
| `listTasks`          | A project's or a section's tasks, with every field the import needs.    |
| `listSubtasks`       | A task's subtasks.                                                      |
| `listDependencies`   | The tasks a task is blocked by.                                         |
| `listCustomFields`   | A project's custom field settings, with types and enum options.         |
| `listStories`        | A task's comments and activity, told apart by `resource_subtype`.       |
| `listAttachments`    | A task's attachments; `download_url` lasts two minutes.                 |
| `downloadAttachment` | Saves an Asana-hosted file into FrogBot files; other hosts stay a link. |

## Triggers

Upstream has no Asana triggers. Each of these takes a `projectGid`; the webhook triggers register one filtered Asana webhook on that project. A delivery is checked against the `X-Hook-Signature` secret Asana returned at registration; each event is emitted with its full task (and comment), or as delivered when Asana can't return them.

| Native trigger   | Type      | Fires when                                                                  |
| ---------------- | --------- | --------------------------------------------------------------------------- |
| `taskCreated`    | `webhook` | A task or subtask is added to the project.                                  |
| `taskChanged`    | `webhook` | A task field changes, once per field.                                       |
| `taskCompleted`  | `webhook` | A task is marked complete (not when it's reopened).                         |
| `commentAdded`   | `webhook` | Someone comments on a task.                                                 |
| `projectChanged` | `polling` | Polls the project's Events API; emits `resync` when the sync token expired. |

`projectChanged` backs up the webhooks, which Asana delivers at most once and drops after 24 hours of failures.
