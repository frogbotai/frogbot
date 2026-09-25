import { buildConfig, type FrogBotConfig } from 'frogbot';
import type { FrogBot } from 'frogbot/test';
import { BasePayload, type Payload } from 'payload';
import { describe } from 'vitest';

import { postgresAdapter } from '../../../packages/db-postgres/src/index.js';
import { vercelPostgresAdapter } from '../../../packages/db-vercel-postgres/src/index.js';
import { initFrogBotFromPayload } from '../../../packages/frogbot/dist/frogbot.js';
import {
  closePostgresPool,
  createPostgresClient,
  createPostgresDatabase,
  createVercelPostgresProxy,
  type PostgresClient,
} from '../../__helpers/shared/db/postgres.js';

export const driver =
  process.env.FROGBOT_SEARCH_DRIVER === 'vercel-postgres' ? 'vercel-postgres' : 'postgres';

export const describePostgres =
  process.env.FROGBOT_DATABASE === 'postgres' ? describe : describe.skip;

export type BootOptions = Pick<FrogBotConfig, 'collections'> & {
  connectionString?: string;
  localization?: FrogBotConfig['localization'];
  migrationDir?: string;
  push?: boolean;
};

export type SearchDatabase = {
  client: PostgresClient;
  name: string;
  url: URL;
  boot: (options: BootOptions) => Promise<{ frogbot: FrogBot; payload: Payload }>;
  shutdown: () => Promise<void>;
};

type NativeDatabase = {
  drizzle?: { $client?: Parameters<typeof closePostgresPool>[0] };
};

function createAdapter({
  connectionString,
  migrationDir,
  push,
}: Omit<BootOptions, 'collections'> & { connectionString: string }) {
  return driver === 'postgres'
    ? postgresAdapter({ migrationDir, pool: { connectionString, max: 4 }, push })
    : vercelPostgresAdapter({
        forceUseVercelPostgres: true,
        migrationDir,
        pool: { connectionString, max: 4, ssl: false },
        push,
      });
}

export async function createSearchDatabase(): Promise<SearchDatabase> {
  process.env.PAYLOAD_DROP_DATABASE = 'false';

  const database = await createPostgresDatabase('frogbot_search');
  const proxy =
    driver === 'vercel-postgres' ? await createVercelPostgresProxy(database.url) : undefined;

  const client = createPostgresClient(database.url.toString());
  const payloads: Payload[] = [];
  const databases: NativeDatabase[] = [];

  await client.connect();

  const boot = async ({ collections, connectionString, localization, ...options }: BootOptions) => {
    const descriptor = createAdapter({
      ...options,
      connectionString: connectionString ?? database.url.toString(),
    });

    const config = await buildConfig({
      secret: 'frogbot-search-postgres',
      db: {
        ...descriptor,
        init(args) {
          const native = descriptor.init(args);

          databases.push(native as NativeDatabase);

          return native;
        },
      },
      typescript: { autoGenerate: false },
      collections,
      ...(localization ? { localization } : {}),
    });

    const payload = new BasePayload();

    await payload.init({
      config: config._internal.payloadConfig,
      disableOnInit: true,
      cron: false,
    });

    payloads.push(payload);

    const frogbot = await initFrogBotFromPayload(payload, config, { disableOnInit: true });

    return { frogbot, payload };
  };

  const shutdown = async () => {
    const pools = databases.map(({ drizzle }) => drizzle?.$client);

    for (const payload of payloads) await payload.destroy();

    for (const pool of pools) await closePostgresPool(pool);

    await client.end();
    await proxy?.();
    await database.drop();
  };

  return { boot, client, name: database.name, shutdown, url: database.url };
}
