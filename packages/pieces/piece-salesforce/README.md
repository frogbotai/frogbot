# `@frogbotai/piece-salesforce`

Import a Salesforce org (any standard or custom object, with SOQL paging and Bulk API 2.0 for large objects), create, update and find records, run reports, and react to record changes and Outbound Messages, with Salesforce sign-in.

## Usage

```ts
import { createSalesforce, defineSalesforce } from '@frogbotai/piece-salesforce';

// Production orgs sign in at login.salesforce.com.
export const salesforce = createSalesforce({
  oauth: {
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
  },
});

// A sandbox, or a My Domain such as acme.my.salesforce.com, is its own piece with its own slug.
export const salesforceSandbox = defineSalesforce({ loginHost: 'test.salesforce.com' })({
  slug: 'salesforce-sandbox',
  oauth: {
    clientId: process.env.SALESFORCE_CLIENT_ID!,
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET!,
  },
});
```

`loginHost` is `login.salesforce.com` (default), `test.salesforce.com` or a `*.my.salesforce.com` host; anything else throws when the piece is defined. One definition signs in at one host.

## Setup

Create an **External Client App** in Salesforce Setup (new Connected Apps can no longer be created): enable OAuth, add the redirect URL FrogBot shows for the piece, require PKCE, and give it the scopes `api`, `refresh_token` and `id`. Copy its consumer key and secret into `oauth`.

Sign-in keeps the token's `instance_url`, and every call goes to `<instance_url>/services/data/v68.0`. Any path outside `/services/data/`, including a `nextRecordsUrl`, is refused before a request. Salesforce's token reply has no `expires_in`, so the recipe's `tokenLifetime` of 15 minutes, the shortest session timeout an org can set, makes core refresh the token before it stops working.

## Import reads

| Action                                                | Reads                                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `query`                                               | One page of a SOQL query (`queryAll` includes deleted records), `batchSize` 200–2,000; pass `nextRecordsUrl` for the next page.     |
| `listObjects`                                         | Every object, standard and custom.                                                                                                  |
| `describeObject`                                      | One object's fields with `custom` and lookups (`referenceTo`, `relationshipName`); `ifModifiedSince` gives `{ notModified: true }`. |
| `createQueryJob`, `getQueryJob`, `getQueryJobResults` | A Bulk API 2.0 query, for objects over 2,000 records: start it, check its state, then read one CSV page per call by `locator`.      |

## Actions

| Upstream action slug         | Previous wrapper export | Native action          | Notes                                                                      |
| ---------------------------- | ----------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `add_contact_to_campaign`    | —                       | `addContactToCampaign` |                                                                            |
| `add_lead_to_campaign`       | —                       | `addLeadToCampaign`    |                                                                            |
| `add_file_to_record`         | —                       | `uploadFile`           | Takes a FrogBot file.                                                      |
| `create_attachment`          | —                       | `createAttachment`     | Takes a FrogBot file.                                                      |
| `get_record_attachments`     | —                       | `listAttachments`      |                                                                            |
| `create_case`                | —                       | `createCase`           |                                                                            |
| `create_contact`             | —                       | `createContact`        |                                                                            |
| `create_lead`                | —                       | `createLead`           |                                                                            |
| `create_note`                | —                       | `createNote`           |                                                                            |
| `create_opportunity`         | —                       | `createOpportunity`    |                                                                            |
| `create_task`                | —                       | `createTask`           |                                                                            |
| `create_record`              | —                       | `createRecord`         |                                                                            |
| `update_contact`             | —                       | `updateContact`        |                                                                            |
| `update_lead`                | —                       | `updateLead`           |                                                                            |
| `update_record`              | —                       | `updateRecord`         |                                                                            |
| `delete_opportunity`         | —                       | `deleteOpportunity`    |                                                                            |
| `delete_record`              | —                       | `deleteRecord`         |                                                                            |
| `find_record`                | —                       | `getRecordByField`     | The value is escaped as a SOQL literal.                                    |
| `find_records_by_query`      | —                       | `searchRecords`        |                                                                            |
| `find_child_records`         | —                       | `listChildRecords`     | Paged with `pageToken`.                                                    |
| `run_query`                  | —                       | `query`                | Pages with `nextRecordsUrl`.                                               |
| `run_report`                 | —                       | `runReport`            |                                                                            |
| `export_report`              | —                       | `exportReport`         | Saves the `.xlsx` in the files collection.                                 |
| `send_email`                 | —                       | `sendEmail`            | Logs a sent EmailMessage, as upstream does; Salesforce doesn't deliver it. |
| `upsert_by_external_id`      | —                       | `upsertRecords`        | Up to 200 records.                                                         |
| `upsert_by_external_id_bulk` | —                       | `upsertRecordsBulk`    | Returns `{ id, state }` once the CSV is uploaded.                          |
| `custom_api_call`            | —                       | `customApiCall`        | Paths under `<instance_url>/services/data/v68.0`.                          |

`create_new_object` and `update_object_by_id` exist upstream but aren't registered; `createRecord` and `updateRecord` cover them.

## Triggers

| Upstream trigger slug     | Native trigger         | Type      | Notes                                                      |
| ------------------------- | ---------------------- | --------- | ---------------------------------------------------------- |
| `new_record`              | `newRecord`            | `polling` | By `CreatedDate`.                                          |
| `new_or_updated_record`   | `newOrUpdatedRecord`   | `polling` | By `SystemModstamp`.                                       |
| `new_contact`             | `newContact`           | `polling` |                                                            |
| `new_lead`                | `newLead`              | `polling` |                                                            |
| `new_field_history_event` | `newFieldHistoryEvent` | `polling` | Reads `<Object>History` or `<Object>__History`.            |
| `new_updated_file`        | `newOrUpdatedFile`     | `polling` |                                                            |
| `new_case_attachment`     | `newCaseAttachment`    | `polling` | `attachmentType` is `Classic` or `File`.                   |
| `new_case`                | `newCaseInQueue`       | `polling` | Created in the queue, or moved into it.                    |
| `new_outbound_message`    | `newOutboundMessage`   | `webhook` | Answers with the SOAP Ack; drops messages from other orgs. |

Polling triggers read up to 200 rows a poll, ordered by timestamp then `Id`, and continue from the last one, so rows sharing a timestamp and backlogs past 2,000 rows are never skipped. The first poll emits nothing.
