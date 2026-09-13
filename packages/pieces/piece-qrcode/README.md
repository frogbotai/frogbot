# `@frogbotai/piece-qrcode`

Create QR code PNG images from text and save them to FrogBot files.

## Usage

```ts
import { createQrCode } from '@frogbotai/piece-qrcode';

export const qrCode = createQrCode();
```

## Actions

| Upstream action slug | Previous wrapper export | Native action  | Notes                                                |
| -------------------- | ----------------------- | -------------- | ---------------------------------------------------- |
| `text_to_qrcode`     | `textToQrcode`          | `createQrCode` | Returns saved file metadata instead of only its URL. |

The upstream piece has no triggers.
