# `@frogbotai/piece-front`

Manage Front contacts, accounts, conversations, messages, and events.

## Usage

```ts
import { createFront } from '@frogbotai/piece-front';

export const front = createFront({ auth: { apiToken: process.env.FRONT_API_TOKEN! } });
```

## Actions

| Upstream action slug         | Previous wrapper export      | Native action             | Notes                                                         |
| ---------------------------- | ---------------------------- | ------------------------- | ------------------------------------------------------------- |
| `addComment`                 | `addComment`                 | `addComment`              |                                                               |
| `addContactHandle`           | `addContactHandle`           | `addContactHandle`        |                                                               |
| `addConversationLinks`       | `addConversationLinks`       | `addConversationLinks`    |                                                               |
| `addConversationTags`        | `addConversationTags`        | `addConversationTags`     |                                                               |
| `assignUnassignConversation` | `assignUnassignConversation` | `assignConversation`      | An omitted assignee unassigns.                                |
| `createAccount`              | `createAccount`              | `createAccount`           |                                                               |
| `createContact`              | `createContact`              | `createContact`           |                                                               |
| `createDraft`                | `createDraft`                | `createDraft`             |                                                               |
| `createDraftReply`           | `createDraftReply`           | `createDraftReply`        |                                                               |
| `createLink`                 | `createLink`                 | `createLink`              |                                                               |
| `findAccount`                | `findAccount`                | `listAccounts`            | The upstream operation lists and optionally filters accounts. |
| `findContact`                | `findContact`                | `searchContacts`          |                                                               |
| `findConversation`           | `findConversation`           | `searchConversations`     |                                                               |
| `removeContactHandle`        | `removeContactHandle`        | `removeContactHandle`     |                                                               |
| `removeConversationLinks`    | `removeConversationLinks`    | `removeConversationLinks` |                                                               |
| `removeConversationTags`     | Not exposed                  | `removeConversationTags`  |                                                               |
| `sendMessage`                | `sendMessage`                | `sendMessage`             |                                                               |
| `sendReply`                  | `sendReply`                  | `sendReply`               |                                                               |
| `updateAccount`              | `updateAccount`              | `updateAccount`           |                                                               |
| `updateContact`              | `updateContact`              | `updateContact`           |                                                               |
| `updateConversation`         | `updateConversation`         | `updateConversation`      |                                                               |
| `updateLink`                 | `updateLink`                 | `updateLink`              |                                                               |

## Triggers

| Upstream trigger slug        | Native trigger              | Type      | Notes |
| ---------------------------- | --------------------------- | --------- | ----- |
| `newComment`                 | `commentCreated`            | `polling` |       |
| `newInboundMessage`          | `inboundMessageCreated`     | `polling` |       |
| `newOutboundMessage`         | `outboundMessageCreated`    | `polling` |       |
| `newTagAddedToMessage`       | `conversationTagAdded`      | `polling` |       |
| `newConversationStateChange` | `conversationStatusChanged` | `polling` |       |

The upstream Front piece registers polling triggers only. It has no webhook verification,
registration, renewal, or removal callbacks to port.
