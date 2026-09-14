# `@frogbotai/piece-trello`

Manage Trello cards and attachments, make authenticated API calls, and react to card events.

## Usage

```ts
import { createTrello } from '@frogbotai/piece-trello';

export const trello = createTrello({
  auth: {
    username: process.env.TRELLO_API_KEY!,
    password: process.env.TRELLO_TOKEN!,
    applicationSecret: process.env.TRELLO_APPLICATION_SECRET!,
  },
});
```

Create an application at [Trello's Power-Up administration page](https://trello.com/power-ups/admin), then copy its API key and application secret. Generate and authorize a token from the API Key page. The API key and token authenticate API requests; the application secret verifies webhook deliveries.

## Actions

| Upstream action slug     | Previous wrapper export | Native action          | Notes                              |
| ------------------------ | ----------------------- | ---------------------- | ---------------------------------- |
| `create_card`            | `createCard`            | `createCard`           |                                    |
| `get_card`               | `getCard`               | `getCard`              |                                    |
| `update_card`            | `updateCard`            | `updateCard`           |                                    |
| `delete_card`            | `deleteCard`            | `deleteCard`           |                                    |
| `get_card_attachments`   | `getCardAttachments`    | `listCardAttachments`  | Uses collection naming.            |
| `add_card_attachment`    | `addCardAttachment`     | `addCardAttachment`    | Uploads from FrogBot files.        |
| `get_card_attachment`    | `getCardAttachment`     | `getCardAttachment`    |                                    |
| `delete_card_attachment` | `deleteCardAttachment`  | `deleteCardAttachment` |                                    |
| `custom_api_call`        | `customApiCall`         | `customApiCall`        | Auth is added as query parameters. |

## Triggers

| Upstream trigger slug | Native trigger    | Type      | Notes                                   |
| --------------------- | ----------------- | --------- | --------------------------------------- |
| `new_card`            | `cardCreated`     | `webhook` | Board or optional list scope.           |
| `card_moved_to_list`  | `cardMovedToList` | `webhook` | Registers against the destination list. |
| `deadline`            | `cardDeadline`    | `polling` | Polls every five minutes.               |
