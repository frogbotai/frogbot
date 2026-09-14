# `@frogbotai/piece-monday`

Manage monday.com boards, items, columns, updates, files, and webhooks.

## Usage

```ts
import { createMonday } from '@frogbotai/piece-monday';

export const monday = createMonday({ auth: { apiToken: process.env.MONDAY_API_TOKEN! } });
```

## Actions

| Upstream action slug                  | Previous wrapper export          | Native action            | Notes                        |
| ------------------------------------- | -------------------------------- | ------------------------ | ---------------------------- |
| `monday_create_column`                | `mondayCreateColumn`             | `createColumn`           |                              |
| `monday_create_group`                 | `mondayCreateGroup`              | `createGroup`            |                              |
| `monday_create_item`                  | `mondayCreateItem`               | `createItem`             |                              |
| `monday_create_update`                | `mondayCreateUpdate`             | `createUpdate`           |                              |
| `monday_get_board_values`             | `mondayGetBoardValues`           | `listBoardItems`         |                              |
| `monday_get_item_column_values`       | `mondayGetItemColumnValues`      | `getItemColumnValues`    |                              |
| `monday_update_column_values_of_item` | `mondayUpdateColumnValuesOfItem` | `updateItemColumnValues` |                              |
| `monday_update_item_name`             | `mondayUpdateItemName`           | `updateItemName`         |                              |
| `monday_upload_file_to_column`        | `mondayUploadFileToColumn`       | `uploadFileToColumn`     | Accepts base64 file content. |

## Triggers

| Upstream trigger slug            | Native trigger  | Type      | Notes                                                   |
| -------------------------------- | --------------- | --------- | ------------------------------------------------------- |
| `monday_new_item_in_board`       | `itemCreated`   | `webhook` | Enriches the event with parsed column values.           |
| `monday_specific_column_updated` | `columnUpdated` | `webhook` | Registers the selected column in webhook configuration. |
