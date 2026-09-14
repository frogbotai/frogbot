# `@frogbotai/piece-notion`

Create, query, update, and monitor Notion pages, databases, blocks, and comments.

## Authentication

OAuth connections use Notion's public OAuth flow. Internal integration tokens are also supported by passing `{ auth: { accessToken } }`; share each required page or database with that integration in Notion first.

```ts
import { createNotion } from '@frogbotai/piece-notion';

export const notion = createNotion({
  auth: { accessToken: process.env.NOTION_TOKEN! },
});
```

## Actions

| Upstream action slug        | Previous wrapper export | Native action         | Notes                                                                                                                                                             |
| --------------------------- | ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_databases`            | None                    | `listDatabases`       | Preserves cursor pagination.                                                                                                                                      |
| `create_database_item`      | None                    | `createDatabaseItem`  | Dynamic fields use the database schema.                                                                                                                           |
| `update_database_item`      | None                    | `updateDatabaseItem`  | Dynamic fields use the database schema.                                                                                                                           |
| `notion-find-database-item` | None                    | `findDatabaseItem`    |                                                                                                                                                                   |
| `list_database_pages`       | None                    | `listDatabasePages`   | Preserves cursor pagination.                                                                                                                                      |
| `createPage`                | None                    | `createPage`          |                                                                                                                                                                   |
| `append_to_page`            | None                    | `appendToPage`        | Content is appended as a paragraph block.                                                                                                                         |
| `getPageOrBlockChildren`    | None                    | `getBlockContent`     | Returns paginated block JSON recursively to the requested depth. Upstream markdown rendering is not exposed because the native package has no markdown converter. |
| `archive_database_item`     | None                    | `archiveDatabaseItem` |                                                                                                                                                                   |
| `restore_database_item`     | None                    | `restoreDatabaseItem` |                                                                                                                                                                   |
| `add_comment`               | None                    | `addComment`          | Requires insert-comment capability.                                                                                                                               |
| `retrieve_database`         | None                    | `retrieveDatabase`    |                                                                                                                                                                   |
| `get_page_comments`         | None                    | `getPageComments`     | Requires read-comment capability.                                                                                                                                 |
| `find_page`                 | None                    | `findPage`            |                                                                                                                                                                   |
| `custom_api_call`           | None                    | `customApiCall`       | Restricted to relative Notion API paths; credentials cannot be sent to another origin.                                                                            |

## Triggers

| Upstream trigger slug   | Native trigger        | Type      | Notes                                     |
| ----------------------- | --------------------- | --------- | ----------------------------------------- |
| `new_database_item`     | `newDatabaseItem`     | `polling` | Timestamp cursor.                         |
| `updated_database_item` | `updatedDatabaseItem` | `polling` | Timestamp cursor.                         |
| `new_comment`           | `newComment`          | `polling` | Requires read-comment capability.         |
| `updated_page`          | `updatedPage`         | `polling` | Watches pages shared with the connection. |

All requests use Notion API version `2022-02-22`. Notion only exposes resources explicitly shared with the OAuth connection or internal integration.
