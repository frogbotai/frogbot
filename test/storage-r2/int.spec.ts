import { describe, it } from 'vitest'

// R2 uses Cloudflare Workers R2 bindings (not S3-compatible API).
// Cannot be integration-tested with LocalStack or any local emulator.
// Payload's own test suite also only has type-level tests for R2.
describe('storage contract [r2]', () => {
  it.todo('requires Cloudflare Workers runtime — no local emulator available')
})
