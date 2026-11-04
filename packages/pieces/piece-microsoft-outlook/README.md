# `@frogbotai/piece-microsoft-outlook`

Send, reply to, forward, file and search Outlook mail, manage calendar events, and page through mail, events and contacts over Microsoft Graph.

## Usage

```ts
import { createMicrosoftOutlook } from '@frogbotai/piece-microsoft-outlook';

// Each person links their own Microsoft account.
export const outlook = createMicrosoftOutlook({
  oauth: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  },
});
```

A company mailbox can be read with the app's own secret instead, with no signed-in person. An admin grants the app's application mail permissions once:

```ts
export const salesMailbox = createMicrosoftOutlook({
  auth: {
    tenantId: process.env.MICROSOFT_TENANT_ID!,
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    mailbox: 'sales@acme.com',
  },
});
```

Linked accounts call `/me`; app-only access calls `/users/<mailbox>`. App-only tokens are reused until 5 minutes before they expire.

`defineMicrosoftOutlook({ cloud, tenantId })` picks the Microsoft cloud (`commercial` or `usGovernment`) and the sign-in tenant; `createMicrosoftOutlook` uses commercial and `common`. Every request stays on that cloud's Graph origin.

Graph errors keep Graph's code, message and status. A 429 or 503 waits for `Retry-After` and retries up to 3 times.

## OAuth scopes

- Always requested: `offline_access`, `User.Read`, `openid`, `email`, `profile`.
- Defaults: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Contacts.Read`.
- Also available: `Mail.Read`, `Calendars.Read`.

## Actions

Upstream splits mail (`microsoft-outlook`) and calendar (`microsoft-outlook-calendar`) into two pieces; here one linked account covers both.

| Upstream action slug       | Native action         | Notes                                                                                          |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `send-email`               | `sendEmail`           | Attachments are FrogBot file ids                                                               |
| `reply-email`              | `replyToEmail`        | Text goes above the quoted thread; adds `replyAll`; `draft` saves without sending              |
| `forwardEmail`             | `forwardEmail`        | Graph's forward keeps the original attachments                                                 |
| `createDraftEmail`         | `createDraftEmail`    |                                                                                                |
| `sendDraftEmail`           | `sendDraft`           |                                                                                                |
| `moveEmailToFolder`        | `moveEmail`           | Returns the moved email, which has a new id                                                    |
| `addLabelToEmail`          | `addCategory`         | Upstream labels are Outlook categories                                                         |
| `removeLabelFromEmail`     | `removeCategory`      |                                                                                                |
| `findEmail`                | `searchEmails`        | Returns the matching emails, newest first                                                      |
| `downloadAttachment`       | `downloadAttachment`  | Saves into FrogBot files; one attachment by id, or all                                         |
| `request_approval_in_mail` | Dropped               | Waiting for a reply belongs to workflows; ask a person with tool approval (ticket 389) instead |
| `create_event`             | `createEvent`         | Adds attendees and body; the end defaults to 30 minutes after the start                        |
| `delete_event`             | `deleteEvent`         | An event that is already gone counts as deleted                                                |
| `list_events`              | `listEvents`          | Uses `calendarView` between `start` and `end`, so recurring events expand; paged with `cursor` |
| `custom_api_call`          | `customApiCall`       | Any Microsoft Graph v1.0 request                                                               |
| —                          | `listCalendars`       | Every calendar in the mailbox                                                                  |
| —                          | `findFreeBusyPeriods` | Graph `getSchedule`; work or school accounts only                                              |
| —                          | `listMailFolders`     | Paged with `cursor`                                                                            |
| —                          | `listEmails`          | Paged with `cursor`; newest first, optional `receivedAfter`                                    |
| —                          | `listContacts`        | Paged with `cursor`; the default contacts folder                                               |

The list actions take `limit` (1–100, default 50) and `cursor`, and return `{ data, pagination: { count, hasMore, nextCursor, limit } }`. Pass `nextCursor` back as `cursor` for the next page; it is `null` on the last page. A cursor off the configured Graph origin is refused.

## Triggers

| Upstream trigger slug | Native trigger     | Type      | Notes                                                                         |
| --------------------- | ------------------ | --------- | ----------------------------------------------------------------------------- |
| `newEmail`            | `newEmail`         | `polling` | Inbox; optional `from` and `to` filters                                       |
| `newEmailInFolder`    | `newEmailInFolder` | `polling` | One folder                                                                    |
| `newAttachment`       | `newAttachment`    | `polling` | Saves each file attachment into FrogBot files; optional folder, default inbox |

All three poll every 5 minutes. The cursor is the newest `receivedDateTime` seen plus the ids received at that instant, so mail arriving in the same second isn't missed or repeated. The first poll emits nothing, saves no files, and starts the cursor at now. Polls run without a signed-in person, so they read the factory `auth` mailbox; watching each rep's own inbox isn't supported yet.
