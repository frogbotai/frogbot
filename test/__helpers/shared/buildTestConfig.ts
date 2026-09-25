import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

export const testCredentials = {
  email: 'dev@frogbot.local',
  password: 'frogbot-test',
};

export const openAccess = {
  create: () => true,
  delete: () => true,
  read: () => true,
  update: () => true,
};

type TestConfigOverrides = Omit<FrogBotConfig, 'secret' | 'db'> & {
  secret?: string;
  db?: FrogBotConfig['db'];
};

/**
 * Build a test config using the database adapter selected by FROGBOT_DATABASE.
 * The adapter is loaded from the generated `test/databaseAdapter.js` file
 * (written by vitest.setup.ts). SQLite is the default.
 */
export async function buildTestConfig(overrides: TestConfigOverrides) {
  // Dynamic import of the generated adapter file
  const { databaseAdapter } = await import('../../databaseAdapter.js');

  const config: FrogBotConfig = {
    secret: 'test-secret',
    db: databaseAdapter,
    typescript: { autoGenerate: false },
    ...overrides,
  };
  return buildConfig(config);
}
