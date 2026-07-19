# @frogbotai/db-vercel-postgres

Vercel Postgres adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbotai/db-vercel-postgres
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { vercelPostgresAdapter } from '@frogbotai/db-vercel-postgres'

export default buildConfig({
  db: vercelPostgresAdapter({
    pool: {
      connectionString: process.env.POSTGRES_URL,
    },
  }),
  // ...rest of config
})
```
