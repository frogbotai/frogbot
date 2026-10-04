# @frogbotai/storage-vercel-blob

Vercel Blob storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-vercel-blob
```

## Usage

```ts
import { buildConfig } from 'frogbot';
import { vercelBlobStorage } from '@frogbotai/storage-vercel-blob';

export default buildConfig({
  plugins: [
    vercelBlobStorage({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }),
  ],
  // ...rest of config
});
```

The adapter stores files for the collection marked `file: true`, if any, and chat assets automatically. List your own upload collections in `collections`, for example `collections: { media: true }`. See [Storage Adapters](https://docs.frogbot.ai/upload/storage-adapters) for every option.
