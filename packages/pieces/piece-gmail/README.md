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

## OAuth scopes

Change the requested scopes with the factory's `scopes` option: `createGmail({ oauth, scopes: ({ defaultScopes }) => [...defaultScopes, 'gmail.labels'] })` adds one, and an array replaces the defaults. `gmailScopes` maps each name to the provider's scope string. Names stand for `https://www.googleapis.com/auth/<name>`, except `openid` and `mail.google.com` (`https://mail.google.com/`).

- Always requested: `openid`, `userinfo.email`, `userinfo.profile`.
- Defaults: `gmail.send`, `gmail.readonly`, `gmail.compose`.
- Also available: `mail.google.com`, `gmail.modify`, `gmail.insert`, `gmail.labels`, `gmail.metadata`, `gmail.settings.basic`, `gmail.settings.sharing`.

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
