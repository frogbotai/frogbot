# `@frogbotai/piece-zendesk`

Import a Zendesk Support account and its help center, manage tickets, users and organizations, and react to Zendesk events, with an admin's API token.

## Usage

```ts
import { createZendesk } from '@frogbotai/piece-zendesk';

export const zendesk = createZendesk({
  auth: {
    subdomain: 'acme', // https://acme.zendesk.com
    email: 'admin@acme.com',
    apiToken: process.env.ZENDESK_API_TOKEN!,
  },
});
```

Requests go only to `https://<subdomain>.zendesk.com`, with `Authorization: Basic base64(<email>/token:<apiToken>)`. A 429 is retried after `Retry-After`, up to 3 times.

## Import reads

FrogBot additions for moving a whole account. Upstream has none of these.

Exports take `startTime` (ISO, at least a minute ago) for a first run or `cursor` to continue, never both, and return `{ data, pagination: { count, hasMore, nextCursor } }`. Keep calling with `nextCursor` until `hasMore` is false, and keep the last `nextCursor` to pick up later changes. Zendesk allows 10 export requests a minute (20 for users), admins only.

| Action                | Reads                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| `exportTickets`       | Tickets, including closed and archived ones; `excludeDeleted` drops deleted ones. |
| `exportUsers`         | Users: end users, agents and admins.                                              |
| `exportOrganizations` | Organizations.                                                                    |
| `exportTicketEvents`  | Ticket events, with every public reply and internal note in `child_events`.       |
| `exportArticles`      | Help-center articles.                                                             |

Lists take `limit` (1–100, default 100) and `cursor`, and return `{ data, pagination: { count, hasMore, nextCursor, limit } }`.

| Action                   | Reads                                                    |
| ------------------------ | -------------------------------------------------------- |
| `listTicketComments`     | A ticket's replies and internal notes, with attachments. |
| `listGroups`             | Agent groups.                                            |
| `listTicketFields`       | Ticket field definitions.                                |
| `listUserFields`         | Custom user field definitions.                           |
| `listOrganizationFields` | Custom organization field definitions.                   |
| `listCategories`         | Help-center categories.                                  |
| `listSections`           | Help-center sections.                                    |
| `listMacros`             | Macros, raw.                                             |
| `listViews`              | Views, raw.                                              |
| `listSlaPolicies`        | SLA policies, raw; all in one page.                      |
| `downloadAttachment`     | Saves an attachment into FrogBot files.                  |

## Actions

| Upstream action slug | Native action   | Notes                  |
| -------------------- | --------------- | ---------------------- |
| custom API call      | `customApiCall` | Paths under `/api/v2`. |
