import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { Payload, Where } from 'payload';
import { afterAll, assert, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot, getFrogBotPayload } from '../../packages/frogbot/src/frogbot.js';
import { toPayloadRequest } from '../../packages/frogbot/src/seams/request.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

type DrizzleDatabase = {
  drizzle: { insert: (table: unknown) => { values: (rows: unknown[]) => Promise<unknown> } };
  tables: Record<string, unknown>;
};

type MongoDatabase = {
  collections: Record<
    string,
    { collection: { insertMany: (rows: unknown[]) => Promise<unknown> } }
  >;
};

const isDrizzle = (db: unknown): db is DrizzleDatabase =>
  typeof db === 'object' && db !== null && 'drizzle' in db && 'tables' in db;

const failOn: { index?: number } = {};

describe(`bulk delete is one transaction [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let payload: Payload;
  let databaseDir: string;

  const insert = async (slug: string, rows: Record<string, unknown>[]) => {
    const db: unknown = payload.db;
    const now = isDrizzle(db) ? new Date().toISOString() : new Date();

    for (let start = 0; start < rows.length; start += 500) {
      const page = rows
        .slice(start, start + 500)
        .map((row) => ({ ...row, createdAt: now, updatedAt: now }));

      if (isDrizzle(db)) await db.drizzle.insert(db.tables[slug]).values(page);
      else await (db as MongoDatabase).collections[slug].collection.insertMany(page);
    }
  };

  const seed = (batch: string, size: number) =>
    insert(
      'rows',
      Array.from({ length: size }, (_, index) => ({ batch, index })),
    );

  const count = async (collection: 'rows' | 'aliased', where: Where) =>
    (await frogbot.count({ collection, where, overrideAccess: true })).totalDocs;

  const deleteBatch = (batch: string, req?: Awaited<ReturnType<FrogBot['createRequest']>>) =>
    frogbot.delete({
      collection: 'rows',
      where: { batch: { equals: batch } },
      depth: 0,
      overrideAccess: true,
      req,
    });

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-bulk-delete-atomic-'));
    const config = await buildConfig({
      secret: 'bulk-delete-atomic-secret',
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({
          client: { url: `file:${join(databaseDir, 'atomic.db')}` },
          transactionOptions: {},
        }),
      }),
      admin: { user: 'editors', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'editors', auth: true, fields: [] },
        {
          slug: 'rows',
          fields: [
            { name: 'batch', type: 'text', index: true },
            { name: 'index', type: 'number' },
          ],
          hooks: {
            afterOperation: [
              ({ operation, result }) => {
                if (operation !== 'delete' || failOn.index === undefined) return result;
                const { docs } = result as { docs: { index?: number }[] };
                if (docs.some(({ index }) => index === failOn.index)) {
                  throw new Error('audit sink rejected the delete');
                }

                return result;
              },
            ],
          },
        },
        {
          slug: 'aliased',
          fields: [{ name: 'batch', type: 'text', index: true }],
          hooks: {
            beforeOperation: [
              ({ args, operation }) => {
                if (operation !== 'delete' || !args.where?.legacyBatch) return args;
                const { legacyBatch, ...rest } = args.where as Record<string, unknown>;

                return { ...args, where: { ...rest, batch: legacyBatch } };
              },
            ],
          },
        },
      ],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });
    payload = getFrogBotPayload(frogbot);
  }, 120_000);

  beforeEach(() => {
    failOn.index = undefined;
  });

  afterAll(async () => {
    await frogbot?.destroy();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it.each([
    ['500 or fewer', 400],
    ['over 500', 1200],
  ])(
    '%s matches: a hook failure on the last page rolls the whole delete back',
    async (label, size) => {
      const batch = `fail-${size}`;
      await seed(batch, size);
      failOn.index = size - 1;

      await expect(deleteBatch(batch)).rejects.toThrow('audit sink rejected the delete');

      expect(await count('rows', { batch: { equals: batch } })).toBe(size);
    },
    120_000,
  );

  it('over 500 matches: a caller transaction that rolls back keeps every matched doc', async () => {
    await seed('caller-tx', 1200);

    const req = await frogbot.createRequest();
    const transactionID = await payload.db.beginTransaction();
    assert.ok(transactionID, 'the adapter started a transaction');
    toPayloadRequest(req).transactionID = transactionID;

    const result = await deleteBatch('caller-tx', req);

    expect(result.docs).toHaveLength(1200);

    await payload.db.rollbackTransaction(transactionID);

    expect(await count('rows', { batch: { equals: 'caller-tx' } })).toBe(1200);
  }, 120_000);

  it('over 500 matches: commits every page when nothing fails', async () => {
    await seed('commit', 1200);

    const result = await deleteBatch('commit');

    expect(result.docs).toHaveLength(1200);
    expect(result.errors).toEqual([]);
    expect(await count('rows', { batch: { equals: 'commit' } })).toBe(0);
  }, 120_000);

  it('disableTransaction: true opens no transaction, like Payload', async () => {
    await seed('no-tx', 400);
    failOn.index = 399;

    await expect(
      frogbot.delete({
        collection: 'rows',
        where: { batch: { equals: 'no-tx' } },
        depth: 0,
        overrideAccess: true,
        disableTransaction: true,
      }),
    ).rejects.toThrow('audit sink rejected the delete');

    expect(await count('rows', { batch: { equals: 'no-tx' } })).toBe(0);
  }, 120_000);

  it('a beforeOperation hook that rewrites the where is honoured at 500 or fewer matches', async () => {
    await insert(
      'aliased',
      Array.from({ length: 400 }, () => ({ batch: 'alias' })),
    );

    const result = await frogbot.delete({
      collection: 'aliased',
      where: { legacyBatch: { equals: 'alias' } },
      depth: 0,
      overrideAccess: true,
    });

    expect(result.docs).toHaveLength(400);
    expect(await count('aliased', { batch: { equals: 'alias' } })).toBe(0);
  }, 120_000);
});
