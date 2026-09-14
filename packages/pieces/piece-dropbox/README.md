# `@frogbotai/piece-dropbox`

Store, search, organize, upload, and download Dropbox files and folders from FrogBot.

## Usage

```ts
import { createDropbox } from '@frogbotai/piece-dropbox';

export const dropbox = createDropbox({
  oauth: {
    clientId: process.env.DROPBOX_CLIENT_ID!,
    clientSecret: process.env.DROPBOX_CLIENT_SECRET!,
  },
});
```

## Actions

| Upstream action slug           | Previous wrapper export    | Native action      | Notes                                                                      |
| ------------------------------ | -------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `search_dropbox`               | `searchDropbox`            | `searchFiles`      |                                                                            |
| `create_new_dropbox_text_file` | `createNewDropboxTextFile` | `createTextFile`   |                                                                            |
| `upload_dropbox_file`          | `uploadDropboxFile`        | `uploadFile`       | Reads an access-checked FrogBot file.                                      |
| `downloadFile`                 | `downloadFile`             | `downloadFile`     | Writes an access-checked FrogBot file.                                     |
| `get_dropbox_file_link`        | `getDropboxFileLink`       | `getTemporaryLink` |                                                                            |
| `delete_dropbox_file`          | `deleteDropboxFile`        | `deleteFile`       |                                                                            |
| `move_dropbox_file`            | `moveDropboxFile`          | `moveFile`         |                                                                            |
| `copy_dropbox_file`            | `copyDropboxFile`          | `copyFile`         |                                                                            |
| `create_new_dropbox_folder`    | `createNewDropboxFolder`   | `createFolder`     |                                                                            |
| `delete_dropbox_folder`        | `deleteDropboxFolder`      | `deleteFolder`     | Omitted from the previous default action list.                             |
| `move_dropbox_folder`          | `moveDropboxFolder`        | `moveFolder`       | Omitted from the previous default action list.                             |
| `copy_dropbox_folder`          | `copyDropboxFolder`        | `copyFolder`       | Omitted from the previous default action list.                             |
| `list_dropbox_folder`          | `listDropboxFolder`        | `listFolder`       | Follows all Dropbox result pages.                                          |
| `custom_api_call`              | `customApiCall`            | `customApiCall`    | Dropbox RPC origin only; authorization overrides and redirects are denied. |

## Triggers

| Upstream trigger slug | Native trigger | Type      | Notes                                                                                                                                                     |
| --------------------- | -------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new_folder`          | `newFolder`    | `polling` | Emits changes after its first poll establishes a Dropbox cursor. FrogBot cannot reproduce the upstream editor-only test preview of five existing folders. |
