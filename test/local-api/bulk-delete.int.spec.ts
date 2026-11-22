import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot, getFrogBotPayload } from '../../packages/frogbot/src/frogbot.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const ROWS = 20_000;

type InsertTarget = { values: (rows: Record<string, unknown>[]) => Promise<unknown> };

type DrizzleDatabase = {
  drizzle: { insert: (table: unknown) => InsertTarget };
  tables: Record<string, unknown>;
};

type MongoModels = Record<
  string,
  { collection: { insertMany: (rows: Record<string, unknown>[]) => Promise<unknown> } }
>;

type MongoDatabase = { collections: MongoModels; versions: MongoModels };

const isDrizzle = (db: unknown): db is DrizzleDatabase =>
  typeof db === 'object' && db !== null && 'drizzle' in db && 'tables' in db;

describe(`bulk delete at scale [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let payload: Payload;
  let databaseDir: string;
  let editorID: number | string;

  const insert = async (
    rows: Record<string, unknown>[],
    write: (page: Record<string, unknown>[]) => Promise<unknown>,
  ) => {
    const now = new Date();

    for (let start = 0; start < rows.length; start += 500) {
      await write(
        rows.slice(start, start + 500).map((row) => ({ ...row, createdAt: now, updatedAt: now })),
      );
    }
  };

  const insertRows = (rows: Record<string, unknown>[]) => {
    const db: unknown = payload.db;

    return insert(rows, (page) =>
      isDrizzle(db)
        ? db.drizzle.insert(db.tables.rows).values(page)
        : (db as MongoDatabase).collections.rows.collection.insertMany(page),
    );
  };

  const insertVersions = (ids: (number | string)[], batch: string) => {
    const db: unknown = payload.db;

    return isDrizzle(db)
      ? insert(
          ids.map((parent, index) => ({ parent, version_batch: batch, version_index: index })),
          (page) => db.drizzle.insert(db.tables._rows_v).values(page),
        )
      : insert(
          ids.map((parent, index) => ({ parent, version: { batch, index } })),
          (page) => (db as MongoDatabase).versions.rows.collection.insertMany(page),
        );
  };

  const seed = async (batch: string) => {
    await insertRows(Array.from({ length: ROWS }, (_, index) => ({ batch, index })));

    const { docs } = await payload.find({
      collection: 'rows',
      where: { batch: { equals: batch } },
      pagination: false,
      select: { batch: true },
      depth: 0,
      overrideAccess: true,
    });

    return docs.map(({ id }) => id);
  };

  const count = async (batch: string) =>
    (
      await frogbot.count({
        collection: 'rows',
        where: { batch: { equals: batch } },
        overrideAccess: true,
      })
    ).totalDocs;

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-bulk-delete-'));
    const config = await buildConfig({
      secret: 'bulk-delete-test-secret',
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({
          client: { url: `file:${join(databaseDir, 'bulk-delete.db')}` },
        }),
      }),
      admin: { user: 'editors', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'editors', auth: true, fields: [] },
        {
          slug: 'rows',
          versions: true,
          fields: [
            { name: 'batch', type: 'text', index: true },
            { name: 'index', type: 'number' },
          ],
        },
      ],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });
    payload = getFrogBotPayload(frogbot);

    editorID = (
      await frogbot.create({
        collection: 'editors',
        data: { email: 'editor@example.com', password: 'editor-password' },
        overrideAccess: true,
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await frogbot?.destroy();
    await rm(databaseDir, { recursive: true, force: true });
  });

  it('deletes 20k matched documents with their versions in one call', async () => {
    await insertVersions(await seed('stale'), 'stale');

    const result = await frogbot.delete({
      collection: 'rows',
      where: { batch: { equals: 'stale' } },
      select: { batch: true },
      depth: 0,
      overrideAccess: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.docs).toHaveLength(ROWS);
    expect(await count('stale')).toBe(0);
    expect(
      (
        await frogbot.countVersions({
          collection: 'rows',
          where: { 'version.batch': { equals: 'stale' } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(0);
  }, 300_000);

  it('checks locks across 20k documents and keeps the locked ones', async () => {
    const ids = await seed('locked');
    const locked = [ids[0], ids[ROWS - 1]];

    for (const id of locked) {
      await payload.create({
        collection: 'payload-locked-documents',
        data: {
          document: { relationTo: 'rows', value: id },
          user: { relationTo: 'editors', value: editorID },
        },
        overrideAccess: true,
      });
    }

    const result = await frogbot.delete({
      collection: 'rows',
      where: { batch: { equals: 'locked' } },
      select: { batch: true },
      depth: 0,
      overrideLock: false,
      overrideAccess: true,
    });

    expect(result.errors.map(({ id }) => id).sort()).toEqual([...locked].sort());
    expect(result.docs).toHaveLength(ROWS - locked.length);
    expect(await count('locked')).toBe(locked.length);
  }, 300_000);
});
