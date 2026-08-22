import { describe, expect, it } from 'vitest'

import { deriveName } from './deriveName.js'

describe('deriveName', () => {
  it.each([
    ['port', 'PORT'],
    ['apiUrl', 'API_URL'],
    ['awsBearerTokenBedrock', 'AWS_BEARER_TOKEN_BEDROCK'],
    ['gitSha1', 'GIT_SHA1'],
    ['s3Bucket', 'S3_BUCKET'],
    ['redisRlHost', 'REDIS_RL_HOST'],
  ])('derives %s as %s', (key, expected) => {
    expect(deriveName(key)).toBe(expected)
  })
})
