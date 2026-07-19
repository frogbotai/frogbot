# @frogbot/storage-uploadthing

UploadThing storage adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbot/storage-uploadthing
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { uploadthingStorage } from '@frogbot/storage-uploadthing'

export default buildConfig({
  storage: [
    uploadthingStorage({
      options: {
        token: process.env.UPLOADTHING_TOKEN,
      },
      collections: {
        media: true,
      },
    }),
  ],
  // ...rest of config
})
```
