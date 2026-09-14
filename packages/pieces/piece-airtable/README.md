# `@frogbotai/piece-airtable`

Create, find, update, and monitor Airtable records and schemas.

## Usage

```ts
import { createAirtable } from '@frogbotai/piece-airtable';

export const airtable = createAirtable({
  auth: { personalAccessToken: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN! },
});
```

## Actions

| Upstream action slug             | Previous wrapper export      | Native action      | Notes                          |
| -------------------------------- | ---------------------------- | ------------------ | ------------------------------ |
| `airtable_create_record`         | `airtableCreateRecord`       | `createRecord`     |                                |
| `airtable_find_record`           | `airtableFindRecord`         | `findRecords`      | Returns every matching record. |
| `airtable_update_record`         | `airtableUpdateRecord`       | `updateRecord`     |                                |
| `airtable_clean_record`          | `airtableCleanRecord`        | `cleanRecord`      |                                |
| `airtable_delete_record`         | `airtableDeleteRecord`       | `deleteRecord`     |                                |
| `airtable_upload_file_to_column` | `airtableUploadFileToColumn` | `uploadAttachment` | Accepts a FrogBot file ID.     |
| `airtable_add_comment_to_record` | `airtableAddCommentToRecord` | `addRecordComment` |                                |
| `airtable_create_base`           | `airtableCreateBase`         | `createBase`       |                                |
| `airtable_create_table`          | `airtableCreateTable`        | `createTable`      |                                |
| `airtable_find_base`             | `airtableFindBase`           | `findBases`        | Returns every matching base.   |
| `airtable_find_table_by_id`      | `airtableFindTableById`      | `getTable`         |                                |
| `airtable_get_record_by_id`      | `airtableGetRecordById`      | `getRecord`        |                                |
| `airtable_find_table`            | `airtableFindTable`          | `findTable`        |                                |
| `airtable_get_base_schema`       | `airtableGetBaseSchema`      | `getBaseSchema`    |                                |
| `custom_api_call`                | `customApiCall`              | `customApiCall`    |                                |

## Triggers

| Upstream trigger slug | Native trigger       | Type      | Notes                                                                             |
| --------------------- | -------------------- | --------- | --------------------------------------------------------------------------------- |
| `new_record`          | `newRecord`          | `polling` | Uses manually entered base, table, and optional view IDs with a timestamp cursor. |
| `updated_record`      | `newOrUpdatedRecord` | `polling` | Uses manual base, table, and optional view IDs plus the last-modified field name. |
