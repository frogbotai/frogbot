# @frogbot/kv-redis

Redis KV store adapter for [FrogBot](https://github.com/firmware-ai/firmware).

## Installation

```bash
pnpm add @frogbot/kv-redis
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { redisKVAdapter } from '@frogbot/kv-redis'

export default buildConfig({
  kv: redisKVAdapter({
    redisURL: process.env.REDIS_URL,
  }),
  // ...rest of config
})
```
