# @frogbot/db-postgres

Postgres adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbot/db-postgres
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { postgresAdapter } from '@frogbot/db-postgres'

export default buildConfig({
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
  }),
  // ...rest of config
})
```
