import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildConfig, type FrogbotConfig } from 'frogbot';
import { getJobLeaseContext } from 'frogbot/jobs';
import { Frogbot } from 'frogbot/test';
import { BasePayload, type Payload, type PayloadRequest } from 'payload';

import { initFrogbotFromPayload } from '../../packages/frogbot/dist/frogbot.js';

export const adapterName =
  process.env.FROGBOT_JOBS_ADAPTER ??
  process.env.TICKET121_ADAPTER ??
  process.env.FROGBOT_DATABASE ??
  'sqlite';

const sourceAdapters = process.env.TICKET121_ADAPTER_SOURCE === '1';

export function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

export type JobGate = {
  entered: ReturnType<typeof deferred>;
  release: ReturnType<typeof deferred>;
};

function externalRequire() {
  const directory = process.env.FROGBOT_JOBS_TOOLS ?? process.env.TICKET121_TOOLS;

  if (!directory) {
    throw new Error('Set FROGBOT_JOBS_TOOLS to the directory containing Miniflare/ws.');
  }

  return createRequire(join(directory, 'package.json'));
}

async function createDatabase() {
  const name = `ticket121_${randomUUID().replaceAll('-', '')}`;
  const cleanups: (() => Promise<void>)[] = [];
  let descriptor: FrogbotConfig['db'];

  if (adapterName === 'sqlite') {
    const { sqliteAdapter } = sourceAdapters
      ? await import('../../packages/db-sqlite/src/index.js')
      : await import('../../packages/db-sqlite/dist/index.js');

    const directory = await mkdtemp(join(tmpdir(), 'frogbot-jobs-acceptance-'));

    descriptor = sqliteAdapter({ client: { url: `file:${join(directory, 'jobs.db')}` } });
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
  } else if (adapterName === 'mongodb') {
    const { mongooseAdapter } = sourceAdapters
      ? await import('../../packages/db-mongodb/src/index.js')
      : await import('../../packages/db-mongodb/dist/index.js');

    const url = new URL(
      process.env.TICKET121_MONGO_URL ??
        process.env.MONGODB_URI ??
        'mongodb://localhost:27018/?directConnection=true&replicaSet=rs0',
    );

    url.pathname = `/${name}`;
    descriptor = mongooseAdapter({ url: url.toString(), ensureIndexes: true });
  } else if (adapterName === 'd1-sqlite') {
    const { sqliteD1Adapter } = sourceAdapters
      ? await import('../../packages/db-d1-sqlite/src/index.js')
      : await import('../../packages/db-d1-sqlite/dist/index.js');

    const { Miniflare } = externalRequire()('miniflare');
    const emulator = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("FrogBot jobs fixture"); } }',
      compatibilityDate: '2026-08-01',
      d1Databases: { DB: name },
    });

    let binding;

    try {
      binding = await emulator.getD1Database('DB');
    } catch (error) {
      await emulator.dispose();

      throw error;
    }

    descriptor = sqliteD1Adapter({ binding });
    cleanups.push(() => emulator.dispose());
  } else if (adapterName === 'postgres' || adapterName === 'vercel-postgres') {
    const nativeRequire = createRequire(
      new URL('../../packages/db-postgres/package.json', import.meta.url),
    );

    const pgRequire = createRequire(nativeRequire.resolve('@payloadcms/db-postgres'));
    const { Client } = pgRequire('pg');
    const url = new URL(
      process.env.TICKET121_POSTGRES_URL ??
        process.env.POSTGRES_URL ??
        'postgres://frogbot:frogbot@localhost:5433/frogbot',
    );

    const admin = new Client({ connectionString: url.toString() });

    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);

    cleanups.push(async () => {
      await admin.query(`DROP DATABASE "${name}"`);
      await admin.end();
    });

    url.pathname = `/${name}`;

    if (adapterName === 'postgres') {
      const { postgresAdapter } = sourceAdapters
        ? await import('../../packages/db-postgres/src/index.js')
        : await import('../../packages/db-postgres/dist/index.js');

      descriptor = postgresAdapter({ pool: { connectionString: url.toString() } });
    } else {
      const { vercelPostgresAdapter } = sourceAdapters
        ? await import('../../packages/db-vercel-postgres/src/index.js')
        : await import('../../packages/db-vercel-postgres/dist/index.js');

      const adapterRequire = createRequire(
        new URL('../../packages/db-vercel-postgres/package.json', import.meta.url),
      );

      const upstreamRequire = createRequire(
        adapterRequire.resolve('@payloadcms/db-vercel-postgres'),
      );

      const vercelRequire = createRequire(upstreamRequire.resolve('@vercel/postgres'));
      const neonModule = join(
        dirname(vercelRequire.resolve('@neondatabase/serverless')),
        'index.mjs',
      );

      const { neonConfig } = await import(pathToFileURL(neonModule).href);
      const { WebSocket, WebSocketServer } = externalRequire()('ws');
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });

      await once(server, 'listening');

      server.on('connection', (socket: InstanceType<typeof WebSocket>) => {
        const tcp = connect({ host: url.hostname, port: Number(url.port || 5432) });

        socket.on('message', (data: Buffer) => tcp.write(data));
        tcp.on('data', (data) => socket.send(data));
        tcp.on('error', () => socket.close());
        socket.on('error', () => tcp.destroy());
        socket.on('close', () => tcp.destroy());
        tcp.on('close', () => socket.close());
      });

      neonConfig.webSocketConstructor = WebSocket;
      neonConfig.wsProxy = () => `127.0.0.1:${server.address().port}`;
      neonConfig.useSecureWebSocket = false;
      neonConfig.forceDisablePgSSL = true;
      neonConfig.pipelineConnect = false;

      cleanups.unshift(async () => {
        for (const socket of server.clients) socket.terminate();

        await new Promise<void>((resolve, reject) =>
          server.close((error?: Error) => (error ? reject(error) : resolve())),
        );
      });

      descriptor = vercelPostgresAdapter({
        forceUseVercelPostgres: true,
        pool: { connectionString: url.toString(), ssl: false },
      });
    }
  } else {
    throw new Error(`Unknown acceptance adapter: ${adapterName}`);
  }

  return { descriptor, cleanups, name };
}

export async function bootJobsFixture({
  jobs = {},
  config: overrides = {},
}: {
  jobs?: FrogbotConfig['jobs'];
  config?: Pick<FrogbotConfig, 'agents' | 'ai' | 'routes'>;
} = {}) {
  process.env.PAYLOAD_DROP_DATABASE = 'false';

  const database = await createDatabase();
  const gates = new Map<string, JobGate>();
  const actions = new Map<string, (req: PayloadRequest) => Promise<void>>();
  const hookEvents: { operation: string; id: string }[] = [];
  const nativeDatabases: Payload['db'][] = [];
  let frogbot: Frogbot | undefined;
  let workerPayload: Payload | undefined;

  const recordCallback = async ({
    job,
    req,
    event,
  }: {
    job: { id: number | string; totalTried?: number; input: object };
    req: PayloadRequest;
    event: string;
  }) => {
    const owner = getJobLeaseContext()?.owner;

    if (!owner) throw new Error('Native task callback has no jobs lease context.');

    const marker = 'marker' in job.input ? job.input.marker : undefined;

    if (typeof marker !== 'string') throw new Error('Native task callback has no input marker.');

    await req.payload.create({
      collection: 'effects',
      data: {
        jobRecord: String(job.id),
        marker: `${marker}:${event}:${(job.totalTried ?? 0) + 1}`,
        owner,
      },
    });
  };

  const shutdown = async () => {
    for (const gate of gates.values()) gate.release.resolve();

    const drivers = nativeDatabases as unknown as {
      drizzle?: {
        $client?: {
          end?: () => Promise<void>;
          close?: () => void;
          _clients?: { release(): void }[];
          _idle?: { client: unknown }[];
        };
      };
      connection?: { dropDatabase(): Promise<void> };
      client?: { close?: () => void };
    }[];

    const clients = drivers.map((driver) => driver.drizzle?.$client ?? driver.client);

    if (adapterName === 'mongodb') await drivers[0]?.connection?.dropDatabase();

    await workerPayload?.destroy();
    await frogbot?.destroy();

    for (const client of clients) {
      if (client && '_clients' in client && adapterName === 'postgres') {
        const idle = new Set(client._idle?.map((entry) => entry.client));

        for (const connection of client._clients ?? []) {
          if (!idle.has(connection)) connection.release();
        }
      }

      if (client && 'end' in client) await client.end?.();

      client?.close?.();
    }

    for (const cleanup of database.cleanups) await cleanup();
  };

  try {
    const config = await buildConfig({
      secret: 'frogbot-jobs-acceptance-secret',
      serverURL: 'https://jobs.example.com',
      ...overrides,
      db: {
        ...database.descriptor,
        init(args) {
          const nativeDatabase = database.descriptor.init(args);

          if (nativeDatabases.length && 'push' in nativeDatabase) nativeDatabase.push = false;

          nativeDatabases.push(nativeDatabase);

          return nativeDatabase;
        },
      },
      typescript: { autoGenerate: false },
      collections: [
        {
          slug: 'effects',
          fields: [
            { name: 'jobRecord', type: 'text', required: true },
            { name: 'marker', type: 'text', required: true },
            { name: 'owner', type: 'text', required: true },
          ],
          hooks: {
            afterChange: [
              ({ doc, operation }) => {
                hookEvents.push({ operation, id: String(doc.id) });

                return doc;
              },
            ],
          },
        },
      ],
      jobs: {
        autoRun: [],
        deleteJobOnComplete: false,
        leaseDuration: 5_000,
        access: { run: () => true },
        tasks: [
          {
            slug: 'record-effect',
            inputSchema: [{ name: 'marker', type: 'text', required: true }],
            outputSchema: [{ name: 'marker', type: 'text', required: true }],
            handler: async ({ input, job, req }) => {
              const owner = getJobLeaseContext()?.owner;

              if (!owner) {
                throw new Error('Native task did not inherit the built jobs lease context.');
              }

              const gate = gates.get(input.marker);

              if (gate) {
                gate.entered.resolve();
                await gate.release.promise;
              }

              await actions.get(input.marker)?.(req);

              await req.payload.create({
                collection: 'effects',
                data: { jobRecord: String(job.id), marker: input.marker, owner },
              });

              return { output: { marker: input.marker } };
            },
          },
          {
            slug: 'retry-effect',
            inputSchema: [
              { name: 'marker', type: 'text', required: true },
              { name: 'alwaysFail', type: 'checkbox' },
            ],
            retries: { attempts: 2, backoff: { type: 'fixed', delay: 0 } },
            handler: async ({ input, job, tasks }) => {
              const checkpoint = await tasks['record-effect']('checkpoint', {
                input: { marker: input.marker },
              });

              if (checkpoint.marker !== input.marker) {
                throw new Error('Native checkpoint output was not restored.');
              }

              if (input.alwaysFail || (job.totalTried ?? 0) < 2) {
                throw new Error('Retry fixture task failure');
              }

              return { output: {} };
            },
            onFail: ({ job, req }) => recordCallback({ job, req, event: 'onFail' }),
            onSuccess: ({ job, req }) => recordCallback({ job, req, event: 'onSuccess' }),
          },
        ],
        jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
          ...defaultJobsCollection,
          access: {
            ...defaultJobsCollection.access,
            update: ({ req }) => req.context.denyJobUpdate !== true,
          },
          fields: [...defaultJobsCollection.fields, { name: 'priority', type: 'number' }],
        }),
        ...jobs,
      },
    });

    frogbot = await new Frogbot().init({ config, disableOnInit: true });

    const payload = (frogbot as unknown as { payload: Payload }).payload;

    if (adapterName === 'mongodb') {
      const models = (
        payload.db as unknown as {
          connection: { models: Record<string, { init(): Promise<unknown> }> };
        }
      ).connection.models;

      await Promise.all(Object.values(models).map((model) => model.init()));
    }

    workerPayload = new BasePayload();

    await workerPayload.init({
      config: config._internal.payloadConfig,
      disableOnInit: true,
      cron: false,
    });

    const worker = await initFrogbotFromPayload(workerPayload, config, { disableOnInit: true });

    return {
      frogbot,
      worker,
      payload,
      workerPayload,
      gates,
      actions,
      hookEvents,
      shutdown,
    };
  } catch (error) {
    await shutdown();

    throw error;
  }
}
