import { randomUUID } from 'node:crypto';

import { mongooseAdapter } from '@frogbotai/db-mongodb';
import { buildConfig, type FrogBotConfig, type FrogBotInstance } from 'frogbot';
import { BasePayload } from 'payload';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { type PostgresAdapter, postgresAdapter } from '../../packages/db-postgres/src/index.js';
import { initFrogBotFromPayload } from '../../packages/frogbot/dist/frogbot.js';
import {
  closePostgresPool,
  createPostgresClient,
  createPostgresDatabase,
} from '../__helpers/shared/db/postgres.js';
import { LIVE_MATRIX } from '../gateway/live/matrix.js';
import { makeLiveApp, post } from '../gateway/live/routes.js';
import { describeLive } from './live.js';

const DIMENSIONS = 768;
const EMBED_MODEL = 'google/gemini-embedding-001';
const ANSWER_MODEL = 'google/gemini-3.5-flash';
const KEYS = ['GOOGLE_GENERATIVE_AI_API_KEY'] as const;

const slug = 'live-rag-docs';

const DOCS = [
  {
    tenant: 'acme',
    title: 'Refund policy',
    body: 'Acme refunds are processed within 14 days. To request one, email billing and quote the approval code LILYPAD-7731.',
  },
  {
    tenant: 'globex',
    title: 'Refund policy',
    body: 'Globex refunds are processed within 30 days. Quote the approval code TADPOLE-0042 when emailing billing.',
  },
  {
    tenant: 'acme',
    title: 'Office hours',
    body: 'The Acme support desk is open Monday to Friday, 9am to 5pm Pacific time.',
  },
  {
    tenant: 'acme',
    title: 'Security',
    body: 'All Acme laptops must use full-disk encryption and rotate passwords every 90 days.',
  },
];

const QUESTION = 'How do I get my money back, and what code do I need?';

type Target = {
  name: string;
  keys: readonly string[];
  setup: () => Promise<{
    db: FrogBotConfig['db'];
    beforeDestroy?: () => Promise<void>;
    afterDestroy?: () => Promise<void>;
  }>;
};

function mongoTarget(name: string, envKey: string, fallback?: string): Target {
  return {
    name,
    keys: fallback ? KEYS : [...KEYS, envKey],
    setup() {
      const url = new URL(process.env[envKey] ?? fallback!);
      url.pathname = `/frogbot-live-rag-${randomUUID().slice(0, 8)}`;
      const adapter = mongooseAdapter({ url: url.toString() });

      return Promise.resolve({
        db: adapter,
        beforeDestroy: async () => {
          const payloadDb = current?.payload.db as {
            connection?: { dropDatabase(): Promise<unknown> };
          };

          await payloadDb.connection?.dropDatabase();
        },
      });
    },
  };
}

function postgresTarget(name: string, envKey?: string): Target {
  return {
    name,
    keys: envKey ? [...KEYS, envKey] : KEYS,
    async setup() {
      if (!envKey) {
        const database = await createPostgresDatabase('frogbot_live_rag');

        return {
          db: postgresAdapter({ pool: { connectionString: database.url.toString(), max: 4 } }),
          afterDestroy: () => database.drop(),
        };
      }

      const connectionString = process.env[envKey]!;
      const schemaName = `frogbot_live_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      const admin = createPostgresClient(connectionString);
      await admin.connect();
      await admin.query('CREATE EXTENSION IF NOT EXISTS vector');
      await admin.query(`CREATE SCHEMA "${schemaName}"`);

      return {
        db: postgresAdapter({ pool: { connectionString, max: 4 }, schemaName }),
        afterDestroy: async () => {
          await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          await admin.end();
        },
      };
    },
  };
}

const TARGETS: Target[] = [
  postgresTarget('local pgvector'),
  mongoTarget(
    'local Atlas',
    'MONGODB_SEARCH_URI',
    process.env.MONGODB_SEARCH_URI ?? 'mongodb://localhost:27019/?directConnection=true',
  ),
  postgresTarget('hosted Neon', 'NEON_DATABASE_URL'),
  mongoTarget('hosted Atlas', 'ATLAS_URI'),
];

let current: { frogbot: FrogBotInstance; payload: { db: unknown } } | undefined;

const google = LIVE_MATRIX.find((entry) => entry.label === 'google')!;

async function embed(texts: string[]): Promise<number[][]> {
  const app = makeLiveApp(google);
  const res = await post<{ data?: { embedding: number[] }[] }>(app, '/v1/embeddings', {
    model: EMBED_MODEL,
    input: texts,
    dimensions: DIMENSIONS,
  });

  expect(res.status, JSON.stringify(res.body)).toBe(200);

  return res.body.data!.map((d) => d.embedding);
}

function waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> {
  return vi.waitFor(
    async () => {
      const value = await read();

      expect(done(value), 'search never became ready').toBe(true);

      return value;
    },
    { timeout: 90_000, interval: 1000 },
  );
}

function isPostgres(db: BasePayload['db'] | undefined): db is BasePayload['db'] & PostgresAdapter {
  return db?.name === 'postgres';
}

for (const target of TARGETS) {
  describeLive(`live RAG: ${target.name}`, { keys: target.keys }, () => {
    let setup: Awaited<ReturnType<Target['setup']>> | undefined;
    let frogbot: FrogBotInstance;
    let payload: BasePayload | undefined;

    beforeAll(async () => {
      setup = await target.setup();

      const config = await buildConfig({
        secret: 'frogbot-live-rag',
        db: setup.db,
        typescript: { autoGenerate: false },
        collections: [
          {
            slug,
            access: { read: () => true, create: () => true },
            fields: [
              { name: 'tenant', type: 'text' },
              { name: 'title', type: 'text' },
              { name: 'body', type: 'textarea' },
              { name: 'embedding', type: 'vector', dimensions: DIMENSIONS },
            ],
            search: {
              kb: {
                lexical: { fields: ['title', 'body'], language: 'english' },
                vector: { field: 'embedding' },
                filters: { fields: ['tenant'] },
              },
            },
          },
        ],
      });

      payload = new BasePayload();

      await payload.init({
        config: config._internal.payloadConfig,
        disableOnInit: true,
        cron: false,
      });

      frogbot = await initFrogBotFromPayload(payload, config, {
        disableOnInit: true,
      });

      current = { frogbot, payload };

      const payloadDb = payload.db as unknown as {
        connection?: { models: Record<string, { init(): Promise<unknown> }> };
      };

      if (payloadDb.connection) {
        await Promise.all(Object.values(payloadDb.connection.models).map((m) => m.init()));
      }

      const vectors = await embed(DOCS.map((d) => `${d.title}\n${d.body}`));

      for (const [i, doc] of DOCS.entries()) {
        await frogbot.create({
          collection: slug,
          data: { ...doc, embedding: vectors[i] },
          overrideAccess: true,
        });
      }
    }, 240_000);

    afterAll(async () => {
      await setup?.beforeDestroy?.().catch(() => undefined);
      const pool = isPostgres(payload?.db) ? payload.db.pool : undefined;
      await payload?.destroy();
      await closePostgresPool(pool);
      current = undefined;
      await setup?.afterDestroy?.();
    });

    it('retrieves the tenant-scoped chunk and answers from it', async () => {
      const [queryVector] = await embed([QUESTION]);

      const result = await waitFor(
        () =>
          frogbot.search({
            collection: slug,
            index: 'kb',
            query: { text: 'refund money back code', vector: queryVector },
            where: { tenant: { equals: 'acme' } },
            limit: 3,
            overrideAccess: true,
          }),
        (r) => r.hits.length > 0,
      );

      const docs = result.hits.map(({ doc }) => doc as unknown as (typeof DOCS)[number]);

      expect(docs[0]?.title).toBe('Refund policy');
      expect(docs.every((d) => d.tenant === 'acme')).toBe(true);

      const context = docs.map((d) => `## ${d.title}\n${d.body}`).join('\n\n');
      const app = makeLiveApp(google);
      const res = await post<{ choices?: { message?: { content?: string } }[] }>(
        app,
        '/v1/chat/completions',
        {
          model: ANSWER_MODEL,
          max_tokens: 1024,
          messages: [
            {
              role: 'system',
              content: `Answer only from the context. If it is not there, say so.\n\n${context}`,
            },
            { role: 'user', content: QUESTION },
          ],
        },
      );

      expect(res.status, JSON.stringify(res.body)).toBe(200);

      const answer = res.body.choices?.[0]?.message?.content ?? '';

      expect(answer).toContain('LILYPAD-7731');
      expect(answer).not.toContain('TADPOLE-0042');
    }, 180_000);
  });
}
