# @frogbotai/storage-gcs

Google Cloud Storage adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbotai/storage-gcs
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { gcsStorage } from '@frogbotai/storage-gcs'

export default buildConfig({
  storage: [
    gcsStorage({
      bucket: process.env.GCS_BUCKET,
      options: {
        projectId: process.env.GCS_PROJECT_ID,
        credentials: JSON.parse(process.env.GCS_CREDENTIALS),
      },
      collections: {
        media: true,
      },
    }),
  ],
  // ...rest of config
})
```
