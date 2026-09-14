# `@frogbotai/piece-attio`

Create and manage Attio CRM records, list entries, notes, tasks, call transcripts, and webhooks.

## Usage

```ts
import { createAttio } from '@frogbotai/piece-attio';

export const attio = createAttio({ auth: { accessToken: process.env.ATTIO_ACCESS_TOKEN! } });
```

## Actions

| Upstream action slug  | Previous wrapper export | Native action       | Notes                |
| --------------------- | ----------------------- | ------------------- | -------------------- |
| `create_record`       | `createRecord`          | `createRecord`      |                      |
| `update_record`       | `updateRecord`          | `updateRecord`      |                      |
| `find_record`         | `findRecord`            | `findRecords`       | Returns all matches. |
| `get_record`          | `getRecord`             | `getRecord`         |                      |
| `create_entry`        | `createEntry`           | `createListEntry`   |                      |
| `update_entry`        | `updateEntry`           | `updateListEntry`   |                      |
| `find_list_entry`     | `findListEntry`         | `findListEntries`   | Returns all matches. |
| `create_note`         | `createNote`            | `createNote`        |                      |
| `get_call_transcript` | `getCallTranscript`     | `getCallTranscript` |                      |
| `create_task`         | `createTask`            | `createTask`        |                      |
| `list_tasks`          | `listTasks`             | `listTasks`         |                      |
| `get_task`            | `getTask`               | `getTask`           |                      |
| `delete_task`         | `deleteTask`            | `deleteTask`        |                      |
| `update_task`         | `updateTask`            | `updateTask`        |                      |
| `custom_api_call`     | `customApiCall`         | `customApiCall`     |                      |

## Triggers

| Upstream trigger slug    | Native trigger         | Type      | Notes                       |
| ------------------------ | ---------------------- | --------- | --------------------------- |
| `record_created`         | `recordCreated`        | `webhook` |                             |
| `record_updated`         | `recordUpdated`        | `webhook` | Supports attribute filters. |
| `list_entry_created`     | `listEntryCreated`     | `webhook` |                             |
| `list_entry_updated`     | `listEntryUpdated`     | `webhook` |                             |
| `call_recording_created` | `callRecordingCreated` | `webhook` |                             |
