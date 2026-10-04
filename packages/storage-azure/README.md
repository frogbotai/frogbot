# @frogbotai/storage-azure

Azure Blob Storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-azure
```

## Usage

```ts
import { buildConfig } from 'frogbot';
import { azureStorage } from '@frogbotai/storage-azure';

export default buildConfig({
  plugins: [
    azureStorage({
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      containerName: process.env.AZURE_STORAGE_CONTAINER_NAME,
      allowContainerCreate: true,
      baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL,
    }),
  ],
  // ...rest of config
});
```

The adapter stores files for the collection marked `file: true`, if any, and chat assets automatically. List your own upload collections in `collections`, for example `collections: { media: true }`. See [Storage Adapters](https://docs.frogbot.ai/upload/storage-adapters) for every option.
