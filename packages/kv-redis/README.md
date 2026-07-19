# @frogbotai/kv-redis

Redis KV store adapter for [FrogBot](https://github.com/frogbotai/frogbot).

## Installation

```bash
pnpm add @frogbotai/kv-redis
```

## Usage

```ts
import { buildConfig } from 'frogbot'
import { redisKVAdapter } from '@frogbotai/kv-redis'

export default buildConfig({
  kv: redisKVAdapter({
    redisURL: process.env.REDIS_URL,
  }),
  // ...rest of config
})
```
