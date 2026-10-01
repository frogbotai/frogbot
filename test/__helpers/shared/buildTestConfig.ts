import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

import { getCurrentDatabaseAdapter } from './db/dbAdapters.js';

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
 * SQLite (the default) is built directly; other adapters are loaded from the
 * generated `test/databaseAdapter.js` file (written by vitest.setup.ts).
 */
export async function buildTestConfig(overrides: TestConfigOverrides) {
  const config: FrogBotConfig = {
    secret: 'test-secret',
    db: await loadDatabaseAdapter(),
    typescript: { autoGenerate: false },
    ...overrides,
  };

  return buildConfig(config);
}

async function loadDatabaseAdapter(): Promise<FrogBotConfig['db']> {
  if (getCurrentDatabaseAdapter() === 'sqlite') {
    return sqliteAdapter({
      client: {
        url: process.env.SQLITE_URL || process.env.DATABASE_URL || 'file:./test-payload.db',
      },
    });
  }

  const { databaseAdapter } = await import('../../databaseAdapter.js');

  return databaseAdapter;
}
