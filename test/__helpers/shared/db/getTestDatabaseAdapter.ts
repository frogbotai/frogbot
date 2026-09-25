import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { getCurrentDatabaseAdapter } from './dbAdapters.js';

export async function getTestDatabaseAdapter({ sqlite }: { sqlite: FrogBotConfig['db'] }) {
  const adapter = getCurrentDatabaseAdapter();
  if (adapter === 'sqlite') return sqlite;
  const uri = adapter === 'postgres' ? process.env.POSTGRES_URL : process.env.MONGODB_URI;
  if (!uri || !new URL(uri).pathname.startsWith('/frogbot-test-')) {
    throw new Error('Adapter verification requires an explicit frogbot-test-* database URL');
  }
  const { databaseAdapter } = await import('../../../databaseAdapter.js');
  return databaseAdapter;
}
