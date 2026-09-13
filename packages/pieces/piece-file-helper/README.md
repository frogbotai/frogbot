# `@frogbotai/piece-file-helper`

Create, inspect, convert, compress, and extract files stored by FrogBot.

## Usage

```ts
import { createFileHelper } from '@frogbotai/piece-file-helper';

export const fileHelper = createFileHelper();
```

## Actions

| Upstream action slug   | Previous wrapper export | Native action        | Notes                                      |
| ---------------------- | ----------------------- | -------------------- | ------------------------------------------ |
| `read_file`            | `readFile`              | `readFile`           | Reads text or Base64 from a FrogBot file.  |
| `createFile`           | `createFile`            | `createFile`         |                                            |
| `change_file_encoding` | `changeFileEncoding`    | `changeFileEncoding` |                                            |
| `checkFileType`        | `checkFileType`         | `checkFileType`      |                                            |
| `zipFiles`             | `zipFiles`              | `zipFiles`           | Supports ZipCrypto and AES-256 passwords.  |
| `unzipFile`            | `unzipFile`             | `unzipFile`          | Stores each extracted non-directory entry. |
| `get_file_name`        | `getFileName`           | `getFileName`        |                                            |
