# @frogbotai/db-mongodb

MongoDB adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbotai/db-mongodb
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { mongooseAdapter } from '@frogbotai/db-mongodb'

export default buildConfig({
  db: mongooseAdapter({
    url: process.env.DATABASE_URL,
  }),
  // ...rest of config
})
```
