# @frogbotai/storage-azure

Azure Blob Storage adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbotai/storage-azure
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { azureStorage } from '@frogbotai/storage-azure'

export default buildConfig({
  storage: [
    azureStorage({
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      containerName: process.env.AZURE_STORAGE_CONTAINER_NAME,
      allowContainerCreate: true,
      baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL,
      collections: {
        media: true,
      },
    }),
  ],
  // ...rest of config
})
```
