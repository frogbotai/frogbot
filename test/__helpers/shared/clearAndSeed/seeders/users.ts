import type { FrogbotInstance } from 'frogbot'

export type CreateUserOverrides = {
  email?: string
  password?: string
  [key: string]: unknown
}

/**
 * Atomic seeder: create one user on the `users` collection. Returns
 * the created doc so the caller can assert against `id`.
 *
 * Tests that need many users should call this repeatedly with
 * distinct email overrides.
 */
export async function createUser(
  frogbot: FrogbotInstance,
  overrides: CreateUserOverrides = {},
) {
  const email = overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = overrides.password ?? 'test-password'
  const data = { ...overrides, email, password }
  return await frogbot.create({
    collection: 'users',
    data,
    overrideAccess: true,
  })
}
