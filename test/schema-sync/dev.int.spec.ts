import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { CollectionConfig } from 'frogbot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, count, type Field, query } from './shared.js';

const title: Field = { name: 'title', type: 'text' };
const company: Field = { name: 'company', type: 'text' };

const deals = (...fields: Field[]): CollectionConfig => ({ slug: 'deals', fields });

describe('the schema sync when Payload connects outside production', () => {
  let dir: string;
  let n = 0;
  const dropDatabase = process.env.PAYLOAD_DROP_DATABASE;

  beforeAll(async () => {
    delete process.env.PAYLOAD_DROP_DATABASE;
    dir = await mkdtemp(join(tmpdir(), 'frogbot-schema-dev-'));
  });

  afterAll(async () => {
    if (dropDatabase !== undefined) process.env.PAYLOAD_DROP_DATABASE = dropDatabase;
    await rm(dir, { recursive: true, force: true });
  });

  async function seeded(): Promise<string> {
    const db = join(dir, `${++n}.db`);
    const app = await connect(db, [deals(title, company)]);

    await app.close();

    const conn = new DatabaseSync(db);

    for (let i = 0; i < 3; i++) {
      conn.prepare('INSERT INTO deals (title, company) VALUES (?, ?)').run(`Deal ${i}`, `Co ${i}`);
    }

    conn.close();

    return db;
  }

  it('creates the tables of a new database without writing a migration row', async () => {
    const db = join(dir, 'new.db');
    const app = await connect(db, [deals(title)]);

    expect(await app.payload.count({ collection: 'deals', overrideAccess: true })).toEqual({
      totalDocs: 0,
    });
    expect(app.logs.error).toEqual([]);

    await app.close();

    expect(count(db, 'SELECT count(*) FROM payload_migrations')).toBe(0);
  });

  it('keeps a removed field hidden, without asking, and shows it again once it is back', async () => {
    const db = await seeded();
    const removed = await connect(db, [deals(title)]);
    const { docs } = await removed.payload.find({
      collection: 'deals',
      sort: 'title',
      overrideAccess: true,
    });

    expect(docs[0]).not.toHaveProperty('company');
    expect(removed.logs.info).toContain(
      '[db-sqlite] Schema sync kept 1 removed column with their data, hidden: deals.company. Nothing is deleted; a field or collection added back shows its data again.',
    );
    expect(removed.logs.error).toEqual([]);

    await removed.close();

    expect(count(db, 'SELECT count(company) FROM deals')).toBe(3);

    const back = await connect(db, [deals(title, company)]);
    const shown = await back.payload.find({
      collection: 'deals',
      sort: 'title',
      overrideAccess: true,
    });

    expect(shown.docs.map((doc) => doc.company)).toEqual(['Co 0', 'Co 1', 'Co 2']);
    expect(back.logs.info.filter((line) => line.includes('Schema sync kept'))).toEqual([]);

    await back.close();
  });

  it('logs a type change that would hide values, keeps them, and keeps starting', async () => {
    const db = await seeded();
    const changed = await connect(db, [deals(title, { name: 'company', type: 'number' })]);

    expect(changed.logs.error).toEqual([
      "[db-sqlite] The schema sync changed nothing: deals.company holds 3 text values that aren't numbers; change the field back, or clear those values, then save again. The app keeps running on the current schema.",
    ]);
    expect(await changed.payload.count({ collection: 'deals', overrideAccess: true })).toEqual({
      totalDocs: 3,
    });

    await changed.close();

    expect(query(db, 'SELECT company FROM deals ORDER BY title')).toEqual([
      { company: 'Co 0' },
      { company: 'Co 1' },
      { company: 'Co 2' },
    ]);
  });

  it('changes the type of a column whose text values are all numbers', async () => {
    const db = join(dir, 'numbers.db');
    const before = await connect(db, [deals(title, company)]);

    await before.payload.create({
      collection: 'deals',
      data: { title: 'A', company: '12' },
      overrideAccess: true,
    });

    await before.close();

    const after = await connect(db, [deals(title, { name: 'company', type: 'number' })]);
    const { docs } = await after.payload.find({ collection: 'deals', overrideAccess: true });

    expect(after.logs.error).toEqual([]);
    expect(docs.map((doc) => doc.company)).toEqual([12]);

    await after.close();
  });
});
