import type { CollectionConfig } from 'frogbot';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createPostgresClient,
  createPostgresDatabase,
  type PostgresClient,
} from '../__helpers/shared/db/postgres.js';
import { type Field, syncPostgres } from './shared.js';

const title: Field = { name: 'title', type: 'text' };
const company: Field = { name: 'company', type: 'text' };
const email: Field = { name: 'email', type: 'text' };

const deals = (...fields: Field[]): CollectionConfig => ({ slug: 'deals', fields });
const notes: CollectionConfig = { slug: 'notes', fields: [{ name: 'body', type: 'text' }] };

describe.skipIf(process.env.FROGBOT_DATABASE !== 'postgres')('syncSchema on Postgres', () => {
  const dropDatabase = process.env.PAYLOAD_DROP_DATABASE;
  const databases: { drop: () => Promise<void> }[] = [];
  const clients: PostgresClient[] = [];
  const printed: string[] = [];

  beforeAll(() => {
    delete process.env.PAYLOAD_DROP_DATABASE;

    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(' '));
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();

    if (dropDatabase !== undefined) process.env.PAYLOAD_DROP_DATABASE = dropDatabase;

    for (const client of clients) await client.end();

    for (const database of databases) await database.drop();
  });

  async function sync(url: string, collections: CollectionConfig[]) {
    const result = await syncPostgres(url, collections);

    expect(printed.filter((line) => /about to|truncate/i.test(line))).toEqual([]);

    return result;
  }

  async function database(): Promise<{ url: string; sql: PostgresClient['query'] }> {
    const created = await createPostgresDatabase('schema_sync');
    const client = createPostgresClient(created.url.toString());

    databases.push(created);

    await client.connect();
    clients.push(client);

    return { url: created.url.toString(), sql: client.query.bind(client) };
  }

  async function seeded(...fields: Field[]) {
    const db = await database();

    expect(await sync(db.url, [deals(title, company, ...fields), notes])).toMatchObject({
      ok: true,
    });

    for (let i = 0; i < 10; i++) {
      await db.sql(
        'INSERT INTO deals (title, company, updated_at, created_at) VALUES ($1, $2, now(), now())',
        [`Deal ${i}`, `Co ${i}`],
      );

      await db.sql('INSERT INTO notes (body, updated_at, created_at) VALUES ($1, now(), now())', [
        `Note ${i}`,
      ]);
    }

    return db;
  }

  const count = async (sql: PostgresClient['query'], text: string) =>
    Number(Object.values((await sql(text)).rows[0])[0]);

  const column = async (sql: PostgresClient['query'], table: string, name: string) =>
    (
      await sql<{ data_type: string; is_nullable: string }>(
        `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, name],
      )
    ).rows[0];

  const schemaDump = async (sql: PostgresClient['query']) =>
    (
      await sql(
        `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' ORDER BY table_name, column_name`,
      )
    ).rows.concat(
      (
        await sql(
          `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
        )
      ).rows,
    );

  it('creates every table on a new database, writes no migration row, and a second sync applies nothing', async () => {
    const { url, sql } = await database();
    const first = await sync(url, [deals(title), notes]);

    expect(first).toMatchObject({ ok: true, kept: [] });
    expect(first.applied.some((s) => s.startsWith('CREATE TABLE "deals"'))).toBe(true);
    expect(await count(sql, 'SELECT count(*) FROM payload_migrations')).toBe(0);
    expect(await sync(url, [deals(title), notes])).toEqual({ ok: true, applied: [], kept: [] });
  });

  it('adds a new collection and a new field, keeping every row', async () => {
    const { url, sql } = await seeded();
    const tasks: CollectionConfig = { slug: 'tasks', fields: [title] };
    const result = await sync(url, [
      deals(title, company, { name: 'stage', type: 'text' }),
      notes,
      tasks,
    ]);

    expect(result).toMatchObject({ ok: true, kept: [] });
    expect(result.applied).toContain('ALTER TABLE "deals" ADD COLUMN "stage" varchar;');
    expect(result.applied.some((s) => s.startsWith('CREATE TABLE "tasks"'))).toBe(true);
    expect(await count(sql, 'SELECT count(*) FROM deals')).toBe(10);
    expect(await count(sql, 'SELECT count(*) FROM tasks')).toBe(0);
  });

  it('adds a new required field with no default as a nullable column and keeps every row', async () => {
    const { url, sql } = await seeded();
    const result = await sync(url, [
      deals(title, company, { name: 'dueDate', type: 'date', required: true }),
      notes,
    ]);

    expect(result).toMatchObject({ ok: true, kept: [] });
    expect(result.applied.some((s) => /ADD COLUMN "due_date"/.test(s) && !/NOT NULL/.test(s))).toBe(
      true,
    );
    expect((await column(sql, 'deals', 'due_date')).is_nullable).toBe('YES');
    expect(await count(sql, 'SELECT count(*) FROM deals')).toBe(10);
  });

  it('keeps a removed field, with its values, and reports it', async () => {
    const { url, sql } = await seeded();
    const result = await sync(url, [deals(title), notes]);

    expect(result).toEqual({
      ok: true,
      applied: [],
      kept: [
        'Schema sync kept 1 removed column with their data, hidden: deals.company. Nothing is deleted; a field or collection added back shows its data again.',
      ],
    });
    expect(await count(sql, 'SELECT count(company) FROM deals')).toBe(10);
  });

  it('keeps a removed collection, with its rows', async () => {
    const { url, sql } = await seeded();
    const result = await sync(url, [deals(title, company)]);

    expect(result).toMatchObject({
      ok: true,
      kept: [
        'Schema sync kept 1 removed table with their data, hidden: notes. Nothing is deleted; a field or collection added back shows its data again.',
      ],
    });
    expect(result.applied.filter((s) => !/notes/.test(s))).toEqual([]);
    expect(await count(sql, 'SELECT count(*) FROM notes')).toBe(10);
    expect((await sync(url, [deals(title, company)])).applied).toEqual([]);
  });

  it('refuses a type change on a table with rows, applying nothing', async () => {
    const { url, sql } = await seeded();
    const before = await schemaDump(sql);
    const result = await sync(url, [deals(title, { name: 'company', type: 'number' }), notes]);

    expect(result).toEqual({
      ok: false,
      applied: [],
      kept: [],
      error:
        "The schema sync changed nothing: deals.company can't change from character varying to numeric while deals has 10 rows; change the field back, or write a migration.",
    });
    expect(await schemaDump(sql)).toEqual(before);
    expect(await count(sql, 'SELECT count(company) FROM deals')).toBe(10);
  });

  it('makes a column with no duplicates unique', async () => {
    const { url, sql } = await seeded(email);

    await sql(`UPDATE deals SET email = 'deal-' || id || '@example.com'`);

    const result = await sync(url, [deals(title, company, { ...email, unique: true }), notes]);

    expect(result).toMatchObject({ ok: true, kept: [] });
    expect(result.applied).toContain(
      'CREATE UNIQUE INDEX "deals_email_idx" ON "deals" USING btree ("email");',
    );
    await expect(
      sql(
        `INSERT INTO deals (email, updated_at, created_at) VALUES ('deal-1@example.com', now(), now())`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('refuses to make a column with duplicates unique, naming how many, and applies nothing', async () => {
    const { url, sql } = await seeded(email);

    await sql(`UPDATE deals SET email = 'deal-' || (id % 7) || '@example.com'`);

    const before = await schemaDump(sql);
    const result = await sync(url, [
      deals(title, company, { ...email, unique: true }, { name: 'stage', type: 'text' }),
      notes,
    ]);

    expect(result).toEqual({
      ok: false,
      applied: [],
      kept: [],
      error:
        "The schema sync changed nothing: deals.email has 3 duplicate values, so it can't become unique. Remove the duplicates, then share again.",
    });
    expect(await schemaDump(sql)).toEqual(before);
  });

  it('keeps every kind of removed field and a collection that turned versions off, and a second sync applies nothing', async () => {
    const { url, sql } = await database();
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

    expect(await sync(url, [{ slug: 'deals', fields, versions: true }, notes])).toMatchObject({
      ok: true,
    });

    await sql(
      `INSERT INTO deals (title, url, stage, updated_at, created_at) VALUES ('d', 'u', 'won', now(), now())`,
    );

    await sql(`INSERT INTO _deals_v (version_title, version_url) VALUES ('v1', 'u')`);

    const off = await sync(url, [{ slug: 'deals', fields: [title], versions: false }]);

    expect(off).toMatchObject({ ok: true });
    expect(off.applied).toEqual(['ALTER TABLE "deals" ALTER COLUMN "url" DROP NOT NULL;']);
    expect(await sync(url, [{ slug: 'deals', fields: [title], versions: false }])).toMatchObject({
      ok: true,
      applied: [],
    });
    expect(await count(sql, `SELECT count(*) FROM deals WHERE stage = 'won' AND url = 'u'`)).toBe(
      1,
    );
    expect(await count(sql, 'SELECT count(*) FROM _deals_v')).toBe(1);
    expect((await sync(url, [{ slug: 'deals', fields, versions: true }, notes])).ok).toBe(true);
    expect(await count(sql, `SELECT count(*) FROM deals WHERE stage = 'won'`)).toBe(1);
  });

  it('drops a select option no row holds, and refuses one a row holds, applying nothing', async () => {
    const stage = (...options: string[]): Field => ({ name: 'stage', type: 'select', options });
    const { url, sql } = await seeded(stage('lead', 'won', 'lost'));

    await sql(`UPDATE deals SET stage = 'won'`);

    const dropped = await sync(url, [deals(title, company, stage('lead', 'won')), notes]);

    expect(dropped).toMatchObject({ ok: true });
    expect(dropped.applied.some((s) => s.startsWith('DROP TYPE'))).toBe(true);
    expect(await count(sql, `SELECT count(*) FROM deals WHERE stage = 'won'`)).toBe(10);

    const before = await schemaDump(sql);
    const refused = await sync(url, [deals(title, company, stage('lead')), notes]);

    expect(refused).toMatchObject({
      ok: false,
      applied: [],
      error: expect.stringMatching(/^The schema sync changed nothing: Postgres refused/),
    });
    expect(await schemaDump(sql)).toEqual(before);
    expect(await count(sql, `SELECT count(*) FROM deals WHERE stage = 'won'`)).toBe(10);
  });

  it('adds a new unique field to a table with rows', async () => {
    const { url, sql } = await seeded();
    const result = await sync(url, [
      deals(title, company, { name: 'code', type: 'text', unique: true }),
      notes,
    ]);

    expect(result).toMatchObject({ ok: true });
    expect(await column(sql, 'deals', 'code')).toMatchObject({ is_nullable: 'YES' });
    expect(await count(sql, 'SELECT count(*) FROM deals')).toBe(10);
  });

  it('adds a select option and makes it the default on a table with rows', async () => {
    const stage = (defaultValue: string, ...options: string[]): Field => ({
      name: 'stage',
      type: 'select',
      options,
      defaultValue,
    });

    const { url, sql } = await seeded(stage('lead', 'lead', 'won'));
    const result = await sync(url, [
      deals(title, company, stage('lost', 'lead', 'won', 'lost')),
      notes,
    ]);

    expect(result).toMatchObject({ ok: true });

    await sql('INSERT INTO deals (title, updated_at, created_at) VALUES ($1, now(), now())', [
      'New',
    ]);

    expect(await count(sql, `SELECT count(*) FROM deals WHERE stage = 'lost'`)).toBe(1);
  });

  it('refuses a new unique field with a default on a table with rows, applying nothing', async () => {
    const { url, sql } = await seeded();
    const before = await schemaDump(sql);
    const result = await sync(url, [
      deals(title, company, { name: 'code', type: 'text', unique: true, defaultValue: 'x' }),
      notes,
    ]);

    expect(result).toEqual({
      ok: false,
      error:
        "The schema sync changed nothing: deals.code has 9 duplicate values, so it can't become unique. Remove the duplicates, then share again.",
      applied: [],
      kept: [],
    });
    expect(await schemaDump(sql)).toEqual(before);
  });

  it('keeps a new select option out of the database when the rest of the sync is refused', async () => {
    const stage = (...options: string[]): Field => ({ name: 'stage', type: 'select', options });
    const { url, sql } = await seeded(stage('lead', 'won'));
    const result = await sync(url, [
      deals(title, company, stage('lead', 'won', 'lost'), {
        name: 'code',
        type: 'text',
        unique: true,
        defaultValue: 'x',
      }),
      notes,
    ]);

    expect(result).toMatchObject({ ok: false, applied: [] });
    expect(
      (await sql(`SELECT unnest(enum_range(NULL::enum_deals_stage))::text AS v`)).rows.map(
        ({ v }) => v,
      ),
    ).toEqual(['lead', 'won']);
  });
});
