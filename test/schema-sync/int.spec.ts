import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { CollectionConfig } from 'frogbot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { columns, count, dropDealColumns, type Field, schemaDump, sync, tables } from './shared.js';

const title: Field = { name: 'title', type: 'text' };
const company: Field = { name: 'company', type: 'text' };

const deals = (...fields: Field[]): CollectionConfig => ({ slug: 'deals', fields });
const notes: CollectionConfig = { slug: 'notes', fields: [{ name: 'body', type: 'text' }] };

describe('syncSchema on a SQLite file', () => {
  let dir: string;
  let n = 0;
  const dropDatabase = process.env.PAYLOAD_DROP_DATABASE;

  beforeAll(async () => {
    delete process.env.PAYLOAD_DROP_DATABASE;
    dir = await mkdtemp(join(tmpdir(), 'frogbot-schema-sync-'));
  });

  afterAll(async () => {
    if (dropDatabase !== undefined) process.env.PAYLOAD_DROP_DATABASE = dropDatabase;
    await rm(dir, { recursive: true, force: true });
  });

  async function seeded(): Promise<string> {
    const db = join(dir, `${++n}.db`);

    expect(await sync(db, [deals(title, company), notes])).toMatchObject({ ok: true });

    const conn = new DatabaseSync(db);

    for (let i = 0; i < 10; i++) {
      conn.prepare('INSERT INTO deals (title, company) VALUES (?, ?)').run(`Deal ${i}`, `Co ${i}`);
      conn.prepare('INSERT INTO notes (body) VALUES (?)').run(`Note ${i}`);
    }

    conn.close();

    return db;
  }

  it('creates every table on a new database, writes no migration row, and a second sync applies nothing', async () => {
    const db = join(dir, 'first.db');
    const first = await sync(db, [deals(title), notes]);

    expect(first).toMatchObject({ ok: true, kept: [] });
    expect(first.applied.some((s) => s.startsWith('CREATE TABLE `deals`'))).toBe(true);
    expect(count(db, 'SELECT count(*) FROM payload_migrations')).toBe(0);
    expect(await sync(db, [deals(title), notes])).toEqual({ ok: true, applied: [], kept: [] });
  });

  it('adds a new required field as a nullable column and keeps every row', async () => {
    const db = await seeded();
    const result = await sync(db, [
      deals(title, company, { name: 'dueDate', type: 'date', required: true }),
      notes,
    ]);

    expect(result).toMatchObject({ ok: true, kept: [] });
    expect(result.applied).toContain('ALTER TABLE `deals` ADD `due_date` text;');
    expect(columns(db, 'deals').find((c) => c.name === 'due_date')?.notnull).toBe(0);
    expect(count(db, 'SELECT count(*) FROM deals')).toBe(10);
  });

  it('keeps a removed field, with its values, and reports it', async () => {
    const db = await seeded();
    const result = await sync(db, [deals(title), notes]);

    expect(result).toEqual({
      ok: true,
      applied: [],
      kept: [
        'deals.company is gone from the code; its 10 values stay hidden. Add "company" back to show them.',
      ],
    });
    expect(count(db, 'SELECT count(company) FROM deals')).toBe(10);
  });

  it('keeps a removed collection, with its rows', async () => {
    const db = await seeded();
    const result = await sync(db, [deals(title, company)]);

    expect(result.applied.filter((s) => !/`(__new_)?_?notes(_v)?_rels`/.test(s))).toEqual([]);
    expect(result).toMatchObject({ ok: true });
    expect(result.kept).toContain(
      'notes is gone from the code; its 10 rows stay hidden. Add the collection back to show them.',
    );
    expect(count(db, 'SELECT count(*) FROM notes')).toBe(10);
    expect((await sync(db, [deals(title, company)])).applied).toEqual([]);
  });

  it('applies nothing and names the data when a change would delete it', async () => {
    const db = await seeded();
    const before = schemaDump(db);
    const result = await sync(db, [deals(title, company), notes], {
      afterSchemaInit: [dropDealColumns],
    });

    expect(result).toMatchObject({
      ok: false,
      applied: [],
      error: expect.stringMatching(
        /^The schema sync changed nothing: this version would delete .*deals\.company \(10 values\)/,
      ),
    });
    expect(schemaDump(db)).toEqual(before);
    expect(count(db, 'SELECT count(company) FROM deals')).toBe(10);
  });

  it("refuses a type change that would hide text that isn't a number, applying nothing", async () => {
    const db = await seeded();
    const before = schemaDump(db);
    const result = await sync(db, [deals(title, { name: 'company', type: 'number' }), notes]);

    expect(result).toMatchObject({
      ok: false,
      applied: [],
      error:
        "The schema sync changed nothing: deals.company holds 10 text values that aren't numbers; change the field back, or clear those values, then save again.",
    });
    expect(schemaDump(db)).toEqual(before);
  });

  it('leaves the version tables of a collection that turned versions off exactly as they are', async () => {
    const db = join(dir, 'versions-off.db');
    const fields: Field[] = [
      title,
      { name: 'url', type: 'text', required: true },
      { name: 'score', type: 'number' },
      { name: 'done', type: 'checkbox' },
      { name: 'due', type: 'date' },
      { name: 'meta', type: 'json' },
      { name: 'stage', type: 'select', options: ['lead', 'won'], defaultValue: 'lead' },
      { name: 'tags', type: 'text', hasMany: true },
      { name: 'kinds', type: 'select', hasMany: true, options: ['a', 'b'] },
      { name: 'note', type: 'relationship', relationTo: 'notes' },
      {
        name: 'patterns',
        type: 'array',
        fields: [{ name: 'label', type: 'text', required: true }],
      },
    ];

    const versioned: CollectionConfig = { slug: 'deals', fields, versions: true };

    expect(await sync(db, [versioned, notes])).toMatchObject({ ok: true });

    const conn = new DatabaseSync(db);

    conn.prepare('INSERT INTO _deals_v (version_title, version_url) VALUES (?, ?)').run('v1', 'u');
    conn.close();

    const before = schemaDump(db).filter(({ name }) => String(name).includes('_deals_v'));
    const result = await sync(db, [{ slug: 'deals', fields, versions: false }, notes]);

    expect(result).toMatchObject({ ok: true });
    expect(result.applied.filter((statement) => statement.includes('_deals_v'))).toEqual([]);
    expect(schemaDump(db).filter(({ name }) => String(name).includes('_deals_v'))).toEqual(before);
    expect(count(db, 'SELECT count(*) FROM _deals_v')).toBe(1);
  });

  it('builds and keeps the search tables of a search-enabled collection', async () => {
    const db = join(dir, 'search.db');
    const articles: CollectionConfig = {
      slug: 'articles',
      fields: [title],
      search: { titles: { lexical: { fields: ['title'] } } },
    };

    expect(await sync(db, [articles])).toMatchObject({ ok: true });

    const search = tables(db).filter((name) => name.startsWith('frogbot_search_'));

    expect(search.length).toBeGreaterThan(0);
    expect(
      await sync(db, [{ ...articles, fields: [title, { name: 'summary', type: 'text' }] }]),
    ).toMatchObject({
      ok: true,
      applied: [
        'ALTER TABLE `articles` ADD `summary` text;',
        'ALTER TABLE `_articles_v` ADD `version_summary` text;',
      ],
    });
    expect(tables(db)).toEqual(expect.arrayContaining(search));
    expect(count(db, 'SELECT count(*) FROM payload_migrations')).toBe(0);
  });
});
