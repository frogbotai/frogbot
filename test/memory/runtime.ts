import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import type { PostgresAdapter } from '@frogbotai/db-postgres';
import type { FrogBotConfig, FrogBotInstance } from 'frogbot';
import type { MemoryAdapter } from 'frogbot/memory';
import { FrogBot, resetFrogBotCache } from 'frogbot/test';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { chatPort, embedderModel, modelPort, usersSlug } from './shared.js';

export const database = process.env.FROGBOT_DATABASE || 'sqlite';

async function databaseAdapter(name: string, sqlitePath: string): Promise<FrogBotConfig['db']> {
  if (database === 'sqlite') {
    const { sqliteAdapter } = await import('@frogbotai/db-sqlite');

    return sqliteAdapter({ client: { url: `file:${sqlitePath}` } });
  }

  if (database === 'postgres') {
    const { postgresAdapter } = await import('@frogbotai/db-postgres');

    return postgresAdapter({
      pool: {
        connectionString:
          process.env.POSTGRES_URL || 'postgres://frogbot:frogbot@localhost:5433/frogbot',
      },
      schemaName: name,
    });
  }

  if (database === 'mongodb') {
    const { mongooseAdapter } = await import('@frogbotai/db-mongodb');
    const url = new URL(
      process.env.MONGODB_URI || 'mongodb://localhost:27018?directConnection=true&replicaSet=rs0',
    );

    url.pathname = `/${name}`;

    return mongooseAdapter({ url: url.toString(), ensureIndexes: true });
  }

  throw new Error(`Memory tests do not support ${database}`);
}

/** Boots one FrogBot with the given memory adapter, and any agents, on the database `FROGBOT_DATABASE` names. */
export function createMemoryHarness({
  agents,
  memory,
}: {
  agents?: FrogBotConfig['agents'];
  memory: () => MemoryAdapter;
}) {
  const name = `memory_${randomUUID().replaceAll('-', '')}`;
  const sqlitePath = fileURLToPath(new URL(`./${name}.db`, import.meta.url));
  let frogbot: FrogBotInstance | undefined;

  async function boot(): Promise<FrogBotInstance> {
    const config = await buildTestConfig({
      db: await databaseAdapter(name, sqlitePath),
      admin: { importMap: { autoGenerate: false } },
      collections: [{ slug: usersSlug, auth: true, fields: [] }],
      ai: {
        providers: {
          test: {
            type: 'openai-compatible',
            baseUrl: `http://127.0.0.1:${modelPort}/v1`,
            apiKey: 'test-key',
            models: [{ id: embedderModel, mode: 'embedding' }],
          },
          'test-chat': {
            type: 'openai-compatible',
            baseUrl: `http://127.0.0.1:${chatPort}/v1`,
            apiKey: 'test-key',
            models: [{ id: 'chat', mode: 'chat' }],
          },
        },
      },
      ...(agents ? { agents } : {}),
      memory: memory(),
    });

    const cache = (globalThis as { _payload?: Map<string, unknown> })._payload;

    cache?.delete('default');
    resetFrogBotCache();

    const drop = process.env.PAYLOAD_DROP_DATABASE;

    process.env.PAYLOAD_DROP_DATABASE = 'true';

    try {
      frogbot = await new FrogBot().init({ config });
    } finally {
      if (drop === undefined) delete process.env.PAYLOAD_DROP_DATABASE;
      else process.env.PAYLOAD_DROP_DATABASE = drop;

      cache?.delete('default');
      resetFrogBotCache();
    }

    return frogbot;
  }

  async function close(): Promise<void> {
    try {
      if (frogbot && database === 'mongodb') {
        await (frogbot.db as unknown as MongooseAdapter).connection.dropDatabase();
      } else if (frogbot && database === 'postgres') {
        await (frogbot.db as unknown as PostgresAdapter).pool.query(
          `DROP SCHEMA "${name}" CASCADE`,
        );
      }
    } finally {
      await frogbot?.destroy();

      if (database === 'sqlite') {
        await Promise.all(
          ['', '-shm', '-wal'].map((suffix) => rm(`${sqlitePath}${suffix}`, { force: true })),
        );
      }
    }
  }

  async function createUser(email: string) {
    if (!frogbot) throw new Error('Boot the harness first.');

    const user = await frogbot.create({
      collection: usersSlug,
      data: { email, password: 'frogbot-test-password' },
      overrideAccess: true,
    });

    return { ...user, collection: usersSlug };
  }

  return { boot, close, createUser };
}
