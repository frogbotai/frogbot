import { sql } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { integer, numeric, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PayloadRequest } from 'payload';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { insertIfMissing } from '../../../../packages/frogbot/src/database/insertIfMissing.js';

const counters = sqliteTable('frogbot_autonumbers', {
  id: integer('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: numeric('value', { mode: 'number' }).notNull(),
  updatedAt: text('updated_at').notNull(),
  createdAt: text('created_at').notNull(),
});

describe('insertIfMissing', () => {
  let db: LibSQLDatabase & { $client: { close: () => void } };
  let req: PayloadRequest;

  beforeEach(async () => {
    db = drizzle(':memory:');

    await db.run(
      sql`create table frogbot_autonumbers (id integer primary key, key text not null unique, value numeric not null, updated_at text not null, created_at text not null)`,
    );

    const adapter = {
      name: 'sqlite',
      packageName: '@frogbotai/db-sqlite',
      drizzle: db,
      sessions: {},
      tableNameMap: new Map([['frogbot_autonumbers', 'frogbot_autonumbers']]),
      tables: { frogbot_autonumbers: counters },
      payload: { collections: { 'frogbot-autonumbers': { config: { flattenedFields: [] } } } },
    };

    req = { payload: { db: adapter } } as unknown as PayloadRequest;
  });

  afterEach(() => {
    db.$client.close();
  });

  const insert = (value: number) =>
    insertIfMissing({
      req,
      collection: 'frogbot-autonumbers',
      data: { key: 'issues.number[project=1]', value },
      target: 'key',
    });

  it('inserts a missing row', async () => {
    await expect(insert(4)).resolves.toBe(true);

    expect(await db.select({ key: counters.key, value: counters.value }).from(counters)).toEqual([
      { key: 'issues.number[project=1]', value: 4 },
    ]);
  });

  it('skips a second insert of one key with no error and keeps the first row', async () => {
    await insert(4);

    await expect(insert(9)).resolves.toBe(false);

    expect(await db.select({ value: counters.value }).from(counters)).toEqual([{ value: 4 }]);
  });

  it('refuses a field the table does not have', async () => {
    await expect(
      insertIfMissing({
        req,
        collection: 'frogbot-autonumbers',
        data: { key: 'a', value: 1, extra: true },
        target: 'key',
      }),
    ).rejects.toThrow("[frogbot] 'frogbot-autonumbers' inserts cannot write field 'extra'.");
  });
});
