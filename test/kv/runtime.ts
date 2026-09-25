import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import type { PostgresAdapter } from '@frogbotai/db-postgres';
import { RedisKVAdapter } from '@frogbotai/kv-redis';
import type { FrogBotConfig, FrogBotInstance } from 'frogbot';
import { FrogBot, resetFrogBotCache } from 'frogbot/test';
import type { Payload } from 'payload';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';

export type KVRuntime = {
  frogbot: FrogBotInstance;
  payload: Payload;
  shutdown: () => Promise<void>;
};

export function createKVRuntimeHarness({ kv }: { kv?: () => FrogBotConfig['kv'] } = {}) {
  const name = `kv_${randomUUID().replaceAll('-', '')}`;
  const sqlitePath = fileURLToPath(new URL(`./${name}.db`, import.meta.url));
  const database = process.env.FROGBOT_DATABASE || 'sqlite';
  const runtimes = new Set<KVRuntime>();
  let initialized = false;

  async function boot(): Promise<KVRuntime> {
    const push = !initialized;
    let db: FrogBotConfig['db'];
    if (database === 'sqlite') {
      const { sqliteAdapter } = await import('@frogbotai/db-sqlite');
      db = sqliteAdapter({ client: { url: `file:${sqlitePath}` }, push });
    } else if (database === 'postgres') {
      const { postgresAdapter } = await import('@frogbotai/db-postgres');
      db = postgresAdapter({
        pool: {
          connectionString:
            process.env.POSTGRES_URL || 'postgres://frogbot:frogbot@localhost:5433/frogbot',
        },
        schemaName: name,
        push,
      });
    } else if (database === 'mongodb') {
      const { mongooseAdapter } = await import('@frogbotai/db-mongodb');
      const url = new URL(
        process.env.MONGODB_URI || 'mongodb://localhost:27018?directConnection=true&replicaSet=rs0',
      );
      url.pathname = `/${name}`;
      db = mongooseAdapter({ url: url.toString(), ensureIndexes: true });
    } else {
      throw new Error(`KV acceptance tests do not support ${database}`);
    }

    const config = await buildTestConfig({
      db,
      admin: { importMap: { autoGenerate: false } },
      collections: [{ slug: 'users', auth: true, fields: [] }],
      ...(kv ? { kv: kv() } : {}),
    });
    const cache = (globalThis as { _payload?: Map<string, unknown> })._payload;
    const previous = cache?.get('default');
    cache?.delete('default');
    resetFrogBotCache();
    const drop = process.env.PAYLOAD_DROP_DATABASE;
    process.env.PAYLOAD_DROP_DATABASE = push ? 'true' : 'false';
    try {
      const frogbot = await new FrogBot().init({ config });
      const payload = (frogbot as unknown as { payload: KVRuntime['payload'] }).payload;
      const runtime: KVRuntime = {
        frogbot,
        payload,
        async shutdown() {
          if (!runtimes.delete(runtime)) return;
          try {
            if (payload.kv instanceof RedisKVAdapter) await payload.kv.redisClient.quit();
          } finally {
            await frogbot.destroy();
          }
        },
      };
      runtimes.add(runtime);
      initialized = true;
      if (database === 'mongodb') {
        const adapter = frogbot.db as unknown as MongooseAdapter;
        await Promise.all(Object.values(adapter.connection.models).map((model) => model.init()));
      }
      return runtime;
    } finally {
      if (drop === undefined) delete process.env.PAYLOAD_DROP_DATABASE;
      else process.env.PAYLOAD_DROP_DATABASE = drop;
      cache?.delete('default');
      if (previous !== undefined) cache?.set('default', previous);
      resetFrogBotCache();
    }
  }

  async function close() {
    const active = [...runtimes];
    try {
      const runtime = active[0];
      if (runtime) {
        await runtime.frogbot.kv.clear();
        if (database === 'mongodb') {
          await (runtime.frogbot.db as unknown as MongooseAdapter).connection.dropDatabase();
        } else if (database === 'postgres') {
          await (runtime.frogbot.db as unknown as PostgresAdapter).pool.query(
            `DROP SCHEMA "${name}" CASCADE`,
          );
        }
      }
    } finally {
      await Promise.all(active.map((runtime) => runtime.shutdown()));
      if (database === 'sqlite') {
        await Promise.all(
          ['', '-shm', '-wal'].map((suffix) => rm(`${sqlitePath}${suffix}`, { force: true })),
        );
      }
    }
  }

  return { boot, close };
}
