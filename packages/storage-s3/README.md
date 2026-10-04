# @frogbotai/storage-s3

S3 storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-s3
```

## Usage

```ts
import { buildConfig } from 'frogbot';
import { s3Storage } from '@frogbotai/storage-s3';

export default buildConfig({
  plugins: [
    s3Storage({
      bucket: process.env.S3_BUCKET,
      config: {
        region: process.env.S3_REGION,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      },
    }),
  ],
  // ...rest of config
});
```

The adapter stores files for the collection marked `file: true`, if any, and chat assets automatically. List your own upload collections in `collections`, for example `collections: { media: true }`. See [Storage Adapters](https://docs.frogbot.ai/upload/storage-adapters) for every option.
