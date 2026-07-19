# @frogbotai/storage-vercel-blob

Vercel Blob storage adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbotai/storage-vercel-blob
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { vercelBlobStorage } from '@frogbotai/storage-vercel-blob'

export default buildConfig({
  storage: [
    vercelBlobStorage({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      collections: {
        media: true,
      },
    }),
  ],
  // ...rest of config
})
```
