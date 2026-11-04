# `@frogbotai/piece-hubspot`

Import a whole HubSpot account (contacts, companies, deals, tickets, activities, owners, pipelines, lists and the associations between them), create, update and find CRM records, and poll HubSpot for changes, with a service key or HubSpot sign-in.

## Usage

```ts
import { createHubSpot } from '@frogbotai/piece-hubspot';

// An app-wide service key (or an existing private-app token).
export const hubspot = createHubSpot({ auth: { accessToken: process.env.HUBSPOT_TOKEN! } });

// Or each person signs in with HubSpot.
export const hubspotForUsers = createHubSpot({
  oauth: {
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
  },
});
```

Both can be set at once: a user's own linked account is used when there is one, and the factory `auth` otherwise.

## Setup

### Service key

HubSpot no longer lets you create private apps, so use a service key for an app-wide credential. Existing private-app tokens still work the same way.

1. In HubSpot, go to **Development**, then **Keys** > **Service keys**, and click **Create service key**.
2. Add the scopes for what the app does: the read scopes below for the import, plus the write scopes for the actions you use.
3. Copy the key into `auth.accessToken`.

### OAuth app

Create a HubSpot app with the redirect URL FrogBot shows for the piece. The app's scopes must match what sign-in asks for, or HubSpot refuses it:

- Always requested: `crm.objects.contacts.read`.
- Requested by default: `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.tickets.read`, `crm.objects.owners.read`, `crm.lists.read`, `crm.schemas.contacts.read`, `crm.schemas.companies.read`, `crm.schemas.deals.read`, `crm.schemas.custom.read`.
- Available through `scopes`: the matching `.write` scopes, `crm.objects.line_items.read|write`, `crm.objects.custom.read|write`, `crm.lists.write`, `e-commerce` (products), `sales-email-read` (email bodies), `files`, `forms`, `automation` and `communication_preferences.read_write`.

Sign-in exchanges the code at `https://api.hubapi.com/oauth/v3/token` with the client credentials in the form body, and core refreshes the token when it expires. The linked account is named by the user's email (from their owner record) and the portal ID.

## Rate limits

A service key or private app gets 100–190 requests per 10 seconds and 250,000–1,000,000 a day, by the account's tier; OAuth apps have their own limits. Search allows 5 requests per second and stops at 10,000 results. A `429` is retried after `Retry-After`, or 10 seconds without one, up to 3 times, then thrown as a `HubSpotError` with HubSpot's `message` and `category`. A daily-limit `429` therefore fails after about 30 seconds.

## Import reads

FrogBot additions for moving a whole account. They don't use search, so they have no 10,000-result limit. Paged reads take `limit` (1–100, default 100) and `cursor`, and return `{ results, nextCursor }`; pass `nextCursor` back as `cursor` until it is `null`.

| Action             | Reads                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listRecords`      | One object's records: `contacts`, `companies`, `deals`, `tickets`, `notes`, `emails`, `calls`, `meetings`, `tasks`, `line_items`, `products` or a custom type ID (`2-…`). Takes `properties` and `associations`. |
| `listAssociations` | Up to 1,000 records' associations to one object type, with labels. Each record has its own `nextCursor`; pass it back in `cursors`, keyed by record ID.                                                          |
| `listLists`        | Lists (segments), by name or object type.                                                                                                                                                                        |
| `listListMembers`  | A list's record IDs.                                                                                                                                                                                             |
| `listOwners`       | Owners, active or archived.                                                                                                                                                                                      |
| `listPipelines`    | Every deal or ticket pipeline with its stages (unpaged).                                                                                                                                                         |
| `listProperties`   | Every property of an object, with types and options (unpaged).                                                                                                                                                   |

## Actions

Every upstream action, as ported, moved or dropped. `get*`, `find*` and `list*` actions are idempotent.

| Upstream action slug         | Native action             | Notes                                                                                                                   |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `create-contact`             | `createContact`           | Creates, then reads the contact back with its default and requested properties, as upstream does.                       |
| `update-contact`             | `updateContact`           | Empty multi-select arrays are skipped.                                                                                  |
| `get-contact`                | `getContact`              |                                                                                                                         |
| `find-contact`               | `findContact`             | One or two equality filters, up to 200 results. Use `listRecords` to read every record.                                 |
| `create-or-update-contact`   | `createOrUpdateContact`   | Upserts on email.                                                                                                       |
| `create-company`             | `createCompany`           |                                                                                                                         |
| `update-company`             | `updateCompany`           |                                                                                                                         |
| `get-company`                | `getCompany`              |                                                                                                                         |
| `find-company`               | `findCompany`             |                                                                                                                         |
| `create-deal`                | `createDeal`              | `dealname`, `pipelineId` and `pipelineStageId`, with dropdowns.                                                         |
| `update-deal`                | `updateDeal`              |                                                                                                                         |
| `get-deal`                   | `getDeal`                 |                                                                                                                         |
| `find-deal`                  | `findDeal`                |                                                                                                                         |
| `create-ticket`              | `createTicket`            | `ticketName`, `pipelineId` and `pipelineStageId`.                                                                       |
| `update-ticket`              | `updateTicket`            |                                                                                                                         |
| `get-ticket`                 | `getTicket`               |                                                                                                                         |
| `find-ticket`                | `findTicket`              |                                                                                                                         |
| `create-line-item`           | `createLineItem`          | `productId`, with a product dropdown.                                                                                   |
| `update-line-item`           | `updateLineItem`          |                                                                                                                         |
| `get-line-item`              | `getLineItem`             |                                                                                                                         |
| `find-line-item`             | `findLineItem`            |                                                                                                                         |
| `create-product`             | `createProduct`           |                                                                                                                         |
| `update-product`             | `updateProduct`           |                                                                                                                         |
| `get-product`                | `getProduct`              |                                                                                                                         |
| `find-product`               | `findProduct`             |                                                                                                                         |
| `create-custome-object`      | `createCustomObject`      | `customObjectType` is the type ID (`2-…`), with a dropdown.                                                             |
| `update-custome-object`      | `updateCustomObject`      |                                                                                                                         |
| `get-custom-object`          | `getCustomObject`         |                                                                                                                         |
| `find-custom-object`         | `findCustomObject`        |                                                                                                                         |
| `create-associations`        | `createAssociations`      | Batches of 100 to the v4 batch create.                                                                                  |
| `remove-associations`        | `removeAssociations`      | Archives one association type (label).                                                                                  |
| `find-associations`          | `findAssociations`        | Every page, with labels.                                                                                                |
| `add_contact_to_list`        | `addContactToList`        | Moved from the shut-down v1 lists API to `/crm/v3/lists/{listId}/memberships/add`; the contact is found by email first. |
| `remove-contact-from-list`   | `removeContactFromList`   | Moved to `/crm/v3/lists/{listId}/memberships/remove`.                                                                   |
| `get-owner-by-email`         | `getOwnerByEmail`         | Returns the owner or `null`, not upstream's page.                                                                       |
| `get-owner-by-id`            | `getOwnerById`            |                                                                                                                         |
| `get-pipeline-stage-details` | `getPipelineStageDetails` | `objectType` is `deals` or `tickets`.                                                                                   |
| `upload-file`                | `uploadFile`              | Uploads a FrogBot file; `file` is `{ fileId, name? }`.                                                                  |
| `add-contact-to-workflow`    | `addContactToWorkflow`    | Keeps the v2 enrollment endpoint, which v4 workflows have no replacement for; the dropdown reads v3 workflows.          |
| `remove-email-subscription`  | `removeEmailSubscription` | Moved from v1 subscriptions to the v4 communication preferences unsubscribe-all.                                        |
| custom API call              | `customApiCall`           | Paths under `https://api.hubapi.com`, with the connected credential.                                                    |
| `create-blog-post`           | Dropped                   | Website (CMS) tool, outside the CRM (397 D1). Use `customApiCall` with `POST /cms/v3/blogs/posts`.                      |
| `create-page`                | Dropped                   | Use `customApiCall` with `POST /cms/v3/pages/site-pages` or `/landing-pages`.                                           |
| `get-page`                   | Dropped                   | Use `customApiCall` with `GET /cms/v3/pages/site-pages/{id}`.                                                           |
| `delete-page`                | Dropped                   | Use `customApiCall` with `DELETE /cms/v3/pages/site-pages/{id}`.                                                        |

## Triggers

All upstream triggers poll, and so do these, every 5 minutes. They run once core can run polling triggers (ticket 388); until then, mounting one fails as core does today. Triggers run with the app-wide credential, the factory `auth`, not a user's linked account, so set `auth` to use them.

The first poll emits nothing and starts the cursor at now. Each later poll looks back 5 minutes past the previous one for HubSpot's search index lag and skips what it already emitted. A search burst over 10,000 results is continued by the next poll.

| Upstream trigger slug               | Native trigger                  | Type      | Notes                                                                                                                      |
| ----------------------------------- | ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `new-contact`                       | `newContact`                    | `polling` | By `createdate`.                                                                                                           |
| `new-or-updated-contact`            | `newOrUpdatedContact`           | `polling` | By `lastmodifieddate`.                                                                                                     |
| `new-contact-property-change`       | `newContactPropertyChange`      | `polling` | Records changed since the last poll whose `propertyName` history has a newer entry.                                        |
| `new-contact-in-list`               | `newContactInList`              | `polling` | Pages the list in join order each poll, up to 10,000 members.                                                              |
| `new-company`                       | `newCompany`                    | `polling` |                                                                                                                            |
| `new-or-updated-company`            | `newOrUpdatedCompany`           | `polling` |                                                                                                                            |
| `new-company-property-change`       | `newCompanyPropertyChange`      | `polling` |                                                                                                                            |
| `new-deal`                          | `newDeal`                       | `polling` |                                                                                                                            |
| `new-deal-property-change`          | `newDealPropertyChange`         | `polling` |                                                                                                                            |
| `deal-stage-updated`                | `dealStageUpdated`              | `polling` | Deals entering the chosen pipeline stage, by `hs_v2_date_entered_current_stage`.                                           |
| `new-ticket`                        | `newTicket`                     | `polling` |                                                                                                                            |
| `new-ticket-property-change`        | `newTicketPropertyChange`       | `polling` |                                                                                                                            |
| `new-line-item`                     | `newLineItem`                   | `polling` |                                                                                                                            |
| `new-or-updated-line-item`          | `newOrUpdatedLineItem`          | `polling` |                                                                                                                            |
| `new-product`                       | `newProduct`                    | `polling` |                                                                                                                            |
| `new-or-updated-product`            | `newOrUpdatedProduct`           | `polling` |                                                                                                                            |
| `new-task`                          | `newTask`                       | `polling` |                                                                                                                            |
| `new-custom-object`                 | `newCustomObject`               | `polling` |                                                                                                                            |
| `new-custom-object-property-change` | `newCustomObjectPropertyChange` | `polling` |                                                                                                                            |
| `new-engagement`                    | `newEngagement`                 | `polling` | Rebuilt on the v3 notes, emails, calls, meetings and tasks objects; v1 engagements are retiring. Emits `{ type, record }`. |
| `new-form-submission`               | `newFormSubmission`             | `polling` | v1 submissions, newest first; field labels now come from `/marketing/v3/forms/{formId}`.                                   |
| `new-email-event`                   | `newEmailEvent`                 | `polling` | v1 email events between the last poll and now.                                                                             |
| `new-email-subscriptions-timeline`  | `newEmailSubscriptionsTimeline` | `polling` | v1 subscriptions timeline.                                                                                                 |
| `new-blog-article`                  | Dropped                         | —         | Website (CMS) tool (397 D1). Poll `customApiCall` with `GET /cms/v3/blogs/posts`.                                          |

Webhook triggers are left out: HubSpot app webhooks are configured statically in the app, and service keys can't receive them.
