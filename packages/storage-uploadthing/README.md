# @frogbotai/storage-uploadthing

UploadThing storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-uploadthing
```

## Usage

```ts
import { buildConfig } from 'frogbot';
import { uploadthingStorage } from '@frogbotai/storage-uploadthing';

export default buildConfig({
  plugins: [
    uploadthingStorage({
      options: {
        token: process.env.UPLOADTHING_TOKEN,
      },
    }),
  ],
  // ...rest of config
});
```

The adapter stores files for FrogBot's files collection and chat assets automatically. List your own upload collections in `collections`, for example `collections: { media: true }`. See [Storage Adapters](https://docs.frogbot.ai/upload/storage-adapters) for every option.
