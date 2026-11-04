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

Inputs are camelCase and sent snake_case. Upstream's ticket, user, group and organization dropdowns become id inputs; the list and find actions return the ids. Custom fields take ids or keys from `listTicketFields`, `listUserFields` and `listOrganizationFields` instead of upstream's dynamic properties.

| Upstream action slug     | Native action         | Notes                                                                                                                                                                          |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `create-ticket`          | `createTicket`        | Requester, assignee, CCs and followers by email, as Zendesk takes them, with no lookups first; a new requester becomes an end user. `forum_topic_id` dropped: deprecated.      |
| `update-ticket`          | `updateTicket`        | Requester by `requesterId`. `updatedStamp` turns on Zendesk's safe update.                                                                                                     |
| `add-tag-to-ticket`      | `addTagToTicket`      | Returns the ticket's tags. `updatedStamp` replaces `safe_update` + `updated_stamp`.                                                                                            |
| `remove-tag-from-ticket` | `removeTagFromTicket` | Returns the ticket's tags.                                                                                                                                                     |
| `attach-file-to-ticket`  | `attachFileToTicket`  | Takes a FrogBot file, uploads it to `/uploads`, then adds it on a comment. Optional `body` and `public`.                                                                       |
| `add-comment-to-ticket`  | `addCommentToTicket`  | Public by default; `public: false` for an internal note. Author by `authorId` instead of an email lookup.                                                                      |
| `create-organization`    | `createOrganization`  |                                                                                                                                                                                |
| `update-organization`    | `updateOrganization`  |                                                                                                                                                                                |
| `create-user`            | `createUser`          | `identities`, `shared_agent`, `moderator`, `report_csv` and `agent_brand_ids` dropped: rare; send them with `customApiCall`. `active` and `shared` dropped: Zendesk sets them. |
| `update-user`            | `updateUser`          | Takes every `createUser` field.                                                                                                                                                |
| `delete-user`            | `deleteUser`          | No confirmation input.                                                                                                                                                         |
| `find-organization`      | `findOrganization`    | One search where every input given must match, instead of a search-type selector; `query` adds raw search syntax.                                                              |
| `find-tickets`           | `findTickets`         | As `findOrganization`. Date filters go in `query`, such as `created>2026-01-01`.                                                                                               |
| `find-user`              | `findUser`            | As `findOrganization`.                                                                                                                                                         |
| `find-agent`             | `findAgent`           | Searches agents and admins instead of paging every agent; `null` when none matches.                                                                                            |
| `find-group`             | `findGroup`           | `null` when none matches.                                                                                                                                                      |
| `find-latest-comment`    | `findLatestComment`   | `null` when the ticket has none.                                                                                                                                               |
| custom API call          | `customApiCall`       | Paths under `https://<subdomain>.zendesk.com/api/v2`.                                                                                                                          |
