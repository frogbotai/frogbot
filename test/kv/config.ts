import type { CollectionConfig } from 'frogbot'

import { redisKVAdapter } from '@frogbotai/kv-redis'
import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js'
import { usersSlug } from './shared.js'

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
}

export default await buildTestConfig({
  collections: [Users],
  kv: redisKVAdapter({
    redisURL: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'frogbot-test:',
  }),
})
