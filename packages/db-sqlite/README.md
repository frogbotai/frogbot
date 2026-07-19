# @frogbot/db-sqlite

SQLite adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbot/db-sqlite
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { sqliteAdapter } from '@frogbot/db-sqlite'

export default buildConfig({
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL,
    },
  }),
  // ...rest of config
})
```
