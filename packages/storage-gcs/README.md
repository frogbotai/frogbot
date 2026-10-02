# @frogbotai/storage-gcs

Google Cloud Storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-gcs
```

## Usage

```ts
import { buildConfig } from 'frogbot';
import { gcsStorage } from '@frogbotai/storage-gcs';

export default buildConfig({
  plugins: [
    gcsStorage({
      bucket: process.env.GCS_BUCKET,
      options: {
        projectId: process.env.GCS_PROJECT_ID,
        credentials: JSON.parse(process.env.GCS_CREDENTIALS),
      },
    }),
  ],
  // ...rest of config
});
```

The adapter stores files for FrogBot's files collection and chat assets automatically. List your own upload collections in `collections`, for example `collections: { media: true }`. See [Storage Adapters](https://docs.frogbot.ai/upload/storage-adapters) for every option.
