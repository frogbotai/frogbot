# @frogbotai/email-resend

Resend email adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbotai/email-resend
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { resendAdapter } from '@frogbotai/email-resend'

export default buildConfig({
  email: resendAdapter({
    apiKey: process.env.RESEND_API_KEY,
    defaultFromAddress: 'noreply@example.com',
    defaultFromName: 'My App',
  }),
  // ...rest of config
})
```
