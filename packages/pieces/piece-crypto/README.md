# `@frogbotai/piece-crypto`

Hash, sign, encode, encrypt, and generate secure values without external credentials.

## Usage

```ts
import { createCrypto } from '@frogbotai/piece-crypto';

export const crypto = createCrypto();
```

## Actions

| Upstream action slug | Previous wrapper export | Native action          | Notes                                            |
| -------------------- | ----------------------- | ---------------------- | ------------------------------------------------ |
| `hash-text`          | `hashText`              | `hashText`             |                                                  |
| `hmac-signature`     | `hmacSignature`         | `generateHmac`         |                                                  |
| `rsa-signature`      | `rsaSignature`          | `generateRsaSignature` | Omitted from the previous default action list.   |
| `generate-password`  | `generatePassword`      | `generatePassword`     | Uses cryptographically secure randomness.        |
| `base64-decode`      | `base64Decode`          | `decodeBase64`         |                                                  |
| `base64-encode`      | `base64Encode`          | `encodeBase64`         |                                                  |
| `openpgpEncrypt`     | `openpgpEncrypt`        | `encryptFile`          | Accepts and returns configured FrogBot file IDs. |

The upstream piece registers no triggers.
