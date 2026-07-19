# @frogbotai/storage-s3

S3 storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-s3
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { s3Storage } from '@frogbotai/storage-s3'

export default buildConfig({
  storage: [
    s3Storage({
      bucket: process.env.S3_BUCKET,
      config: {
        region: process.env.S3_REGION,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      },
      collections: {
        media: true,
      },
    }),
  ],
  // ...rest of config
})
```
