# @frogbotai/storage-r2

Cloudflare R2 storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-r2
```

## Usage

```ts
import { buildConfig } from 'frogbot';
import { r2Storage } from '@frogbotai/storage-r2';

export default buildConfig({
  plugins: [
    r2Storage({
      bucket: env.R2_BUCKET,
    }),
  ],
  // ...rest of config
});
```

The adapter stores files for FrogBot's files collection and chat assets automatically. List your own upload collections in `collections`, for example `collections: { media: true }`. See [Storage Adapters](https://docs.frogbot.ai/upload/storage-adapters) for every option.
