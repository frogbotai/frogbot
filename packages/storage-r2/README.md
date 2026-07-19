# @frogbot/storage-r2

Cloudflare R2 storage adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbot/storage-r2
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { r2Storage } from '@frogbot/storage-r2'

export default buildConfig({
  storage: [
    r2Storage({
      bucket: env.R2_BUCKET,
      collections: {
        media: true,
      },
    }),
  ],
  // ...rest of config
})
```
