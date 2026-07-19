# @frogbotai/db-sqlite

SQLite adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/db-sqlite
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { sqliteAdapter } from '@frogbotai/db-sqlite'

export default buildConfig({
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL,
    },
  }),
  // ...rest of config
})
```
