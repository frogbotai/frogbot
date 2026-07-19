# @frogbot/db-d1-sqlite

Cloudflare D1 SQLite adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbot/db-d1-sqlite
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { sqliteD1Adapter } from '@frogbot/db-d1-sqlite'

export default buildConfig({
  db: sqliteD1Adapter({
    binding: 'DB',
  }),
  // ...rest of config
})
```
