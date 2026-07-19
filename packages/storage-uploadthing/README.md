# @frogbotai/storage-uploadthing

UploadThing storage adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/storage-uploadthing
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { uploadthingStorage } from '@frogbotai/storage-uploadthing'

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
