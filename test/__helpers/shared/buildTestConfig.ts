import { buildConfig } from 'frogbot'
import type { FrogbotConfig } from 'frogbot'

export const testCredentials = {
  email: 'dev@frogbot.local',
  password: 'frogbot-test',
}

export const openAccess = {
  create: () => true,
  delete: () => true,
  read: () => true,
  update: () => true,
}

type TestConfigOverrides = Omit<FrogbotConfig, 'secret' | 'db'> & {
  secret?: string
  db?: FrogbotConfig['db']
}

/**
 * Build a test config using the database adapter selected by FROGBOT_DATABASE.
 * The adapter is loaded from the generated `test/databaseAdapter.js` file
 * (written by vitest.setup.ts). Falls back to in-memory MongoDB via env var
 * when FROGBOT_DATABASE=mongodb (default).
 */
export async function buildTestConfig(overrides: TestConfigOverrides) {
  // Dynamic import of the generated adapter file
  const { databaseAdapter } = await import('../../databaseAdapter.js')

  const config: FrogbotConfig = {
    secret: 'test-secret',
    db: databaseAdapter,
    typescript: { autoGenerate: false },
    ...overrides,
  }
  return buildConfig(config)
}
