# @frogbotai/transformer-sharp

Image resizing for [FrogBot](https://github.com/frogbotai/frogbot) uploads, through [sharp](https://sharp.pixelplumbing.com).

Without a transformer, FrogBot stores uploaded images as they are. Add `sharpTransformer()` to resize images on the fly with query parameters, and to declare image sizes (`variants`) per collection.

## Installation

```bash
pnpm add @frogbotai/transformer-sharp
```

## Usage

```ts
import { sharpTransformer } from '@frogbotai/transformer-sharp';
import { buildConfig } from 'frogbot';

export default buildConfig({
  // ...
  upload: {
    transformers: [
      sharpTransformer({
        collections: {
          files: {
            variants: [{ name: 'thumbnail', width: 400, height: 300, position: 'centre' }],
          },
        },
      }),
    ],
  },
});
```

Each entry in `collections` takes the image options that lived on a 3.x upload collection: `variants`, `resizeOptions`, `formatOptions`, `trimOptions`, `constructorOptions`, `withMetadata`, `crop` and `focalPoint`. `dynamic: true` also resizes on request, through `?width=` and `?height=` on the file URL.

Registering any transformer changes the file endpoint: a file must belong to an upload document to be served. See [Uploads](https://docs.frogbot.ai/upload/overview#image-sizes).
