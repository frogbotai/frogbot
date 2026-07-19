# @frogbotai/db-postgres

Postgres adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/db-postgres
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { postgresAdapter } from '@frogbotai/db-postgres'

export default buildConfig({
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
  }),
  // ...rest of config
})
```
