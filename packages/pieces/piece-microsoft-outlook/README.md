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

| Upstream action slug | Native action   | Notes                            |
| -------------------- | --------------- | -------------------------------- |
| `custom_api_call`    | `customApiCall` | Any Microsoft Graph v1.0 request |
