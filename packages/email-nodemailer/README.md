# @frogbotai/email-nodemailer

Nodemailer email adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/email-nodemailer
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { nodemailerAdapter } from '@frogbotai/email-nodemailer'

export default buildConfig({
  email: await nodemailerAdapter({
    defaultFromAddress: 'noreply@example.com',
    defaultFromName: 'My App',
    transportOptions: {
      host: process.env.SMTP_HOST,
      port: 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
  }),
  // ...rest of config
})
```
