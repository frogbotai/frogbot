import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageURL = (name: string) =>
  new URL(`../../../../packages/${name}/package.json`, import.meta.url);

export const defaultPostgresURL = 'postgres://frogbot:frogbot@localhost:5433/frogbot';

export type PostgresClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

export function createPostgresClient(connectionString: string): PostgresClient {
  const adapterRequire = createRequire(packageURL('db-postgres'));
  const { Client } = createRequire(adapterRequire.resolve('@payloadcms/db-postgres'))('pg');

  return new Client({ connectionString });
}

export async function createPostgresDatabase(prefix: string) {
  const url = new URL(process.env.POSTGRES_URL ?? defaultPostgresURL);
  const name = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const admin = createPostgresClient(url.toString());

  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);

  url.pathname = `/${name}`;

  return {
    name,
    url,
    admin,
    async drop() {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}

type PostgresPool = {
  _clients?: { release(): void }[];
  _idle?: { client: unknown }[];
  end(): Promise<void>;
  on(event: 'error', listener: () => void): unknown;
};

export async function closePostgresPool(pool: PostgresPool | undefined): Promise<void> {
  if (!pool) return;

  pool.on('error', () => undefined);

  const idle = new Set(pool._idle?.map((entry) => entry.client));

  for (const client of pool._clients ?? []) {
    if (!idle.has(client)) client.release();
  }

  await pool.end();
}

export function requireTestTool(name: string) {
  const directory =
    process.env.FROGBOT_TEST_TOOLS ?? process.env.FROGBOT_JOBS_TOOLS ?? process.env.TICKET121_TOOLS;

  if (!directory) {
    throw new Error(`Set FROGBOT_TEST_TOOLS to a directory that can resolve '${name}'.`);
  }

  return createRequire(join(directory, 'package.json'))(name);
}

export async function createVercelPostgresProxy(url: URL): Promise<() => Promise<void>> {
  const adapterRequire = createRequire(packageURL('db-vercel-postgres'));
  const upstreamRequire = createRequire(adapterRequire.resolve('@payloadcms/db-vercel-postgres'));
  const vercelRequire = createRequire(upstreamRequire.resolve('@vercel/postgres'));
  const neonModule = join(dirname(vercelRequire.resolve('@neondatabase/serverless')), 'index.mjs');

  const { neonConfig } = await import(pathToFileURL(neonModule).href);
  const { WebSocket, WebSocketServer } = requireTestTool('ws');
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

  return async () => {
    for (let attempt = 0; server.clients.size && attempt < 50; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    for (const socket of server.clients) socket.terminate();

    await new Promise<void>((resolve, reject) =>
      server.close((error?: Error) => (error ? reject(error) : resolve())),
    );
  };
}
