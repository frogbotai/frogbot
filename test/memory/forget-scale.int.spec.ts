import type { FrogBotInstance } from 'frogbot';
import { databaseMemory } from 'frogbot/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMemoryHarness } from './runtime.js';

const ROWS = 20_000;
const SLUG = 'frogbot-memories';

type Rows = Record<string, unknown>[];

type MemoryDatabase = {
  drizzle?: { insert: (table: unknown) => { values: (rows: Rows) => Promise<unknown> } };
  tables?: Record<string, unknown>;
  collections?: Record<string, { collection: { insertMany: (rows: Rows) => Promise<unknown> } }>;
};

describe(`memory forget at scale [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  const harness = createMemoryHarness({ memory: () => databaseMemory({ maxPerScope: 100_000 }) });
  let frogbot: FrogBotInstance;

  const countMemories = async () =>
    (await frogbot.count({ collection: SLUG, overrideAccess: true })).totalDocs;

  const fillBucket = async () => {
    const { docs } = await frogbot.find({
      collection: SLUG,
      overrideAccess: true,
      depth: 0,
    });

    const { bucket, scope } = docs[0] as Record<string, unknown>;
    const db = frogbot.db as unknown as MemoryDatabase;
    const now = db.drizzle ? new Date().toISOString() : new Date();
    const rows = Array.from({ length: ROWS }, (_, index) => ({
      bucket,
      scope,
      slot: `bulk:${index}`,
      text: `memory ${index}`,
      fingerprint: `fingerprint-${index}`,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }));

    const write = (page: Rows) =>
      db.drizzle && db.tables
        ? db.drizzle.insert(db.tables.frogbot_memories).values(page)
        : db.collections?.[SLUG]?.collection.insertMany(page);

    for (let start = 0; start < rows.length; start += 500) {
      await write(rows.slice(start, start + 500));
    }
  };

  beforeAll(async () => {
    frogbot = await harness.boot();
  });

  afterAll(() => harness.close());

  it('forgets every memory in a scope with 20k rows', async () => {
    await frogbot.memory.save({ scope: 'team', key: 'seed', text: 'seed row' });
    await fillBucket();

    expect(await frogbot.memory.forget({ scope: 'team' })).toEqual({ deleted: ROWS + 1 });
    expect(await countMemories()).toBe(0);
  }, 300_000);
});
