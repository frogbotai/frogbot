# `@frogbotai/piece-gmail`

Send, draft, read, search, and poll Gmail messages.

## Usage

```ts
import { createGmail } from '@frogbotai/piece-gmail';

export const gmail = createGmail({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});
```

## Actions

| Upstream action slug       | Previous wrapper export | Native action      | Notes                                                  |
| -------------------------- | ----------------------- | ------------------ | ------------------------------------------------------ |
| `send_email`               | `sendEmail`             | `send`             | Supports sending, drafts, reply headers, and file IDs. |
| `request_approval_in_mail` | `requestApprovalInMail` | Dropped            | Durable approval waits belong to F8 workflows.         |
| `reply_to_email`           | `replyToEmail`          | `replyToEmail`     |                                                        |
| `create_draft_reply`       | `createDraftReply`      | `createDraftReply` |                                                        |
| `gmail_get_mail`           | `gmailGetMail`          | `getEmail`         |                                                        |
| `gmail_search_mail`        | `gmailSearchMail`       | `searchEmails`     |                                                        |
| `custom_api_call`          | `customApiCall`         | `customApiCall`    | Restricted to Gmail API paths.                         |

## Triggers

| Upstream trigger slug      | Native trigger | Type      | Notes                                                   |
| -------------------------- | -------------- | --------- | ------------------------------------------------------- |
| `gmail_new_email_received` | `newEmail`     | `polling` | Uses the previous poll time as a Gmail `after:` cursor. |
