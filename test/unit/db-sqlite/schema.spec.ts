import { describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../packages/db-sqlite/src/index';
import {
  affinity,
  findLosses,
  findTypeChanges,
  withoutKeptTables,
  withoutNoOps,
} from '../../../packages/db-sqlite/src/schema/guard';
import type { LiveSchema, LiveTable } from '../../../packages/db-sqlite/src/schema/live';
import { type RawTable, reconcile } from '../../../packages/db-sqlite/src/schema/reconcile';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));
vi.mock('frogbot/aggregate', () => import('../../../packages/frogbot/src/exports/aggregate.js'));
vi.mock('frogbot/search', () => import('../../../packages/frogbot/src/exports/search.js'));

const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const liveTable = (table: Partial<LiveTable> & { name: string }): LiveTable => ({
  columns: [],
  foreignKeys: [],
  indexes: [],
  autoIncrement: false,
  rows: 0,
  indexSql: new Map(),
  ...table,
});

const col = (name: string, type = 'text', extra = {}) => ({
  name,
  type,
  notNull: false,
  default: null,
  primaryKey: false,
  ...extra,
});

const live: LiveSchema = new Map([
  [
    'deals',
    liveTable({
      name: 'deals',
      rows: 40,
      columns: [
        col('id', 'integer', { primaryKey: true, notNull: true }),
        col('company'),
        col('title', 'text', { notNull: true }),
        col('stage', 'text', { notNull: true, default: "'lead'" }),
        col('owner_id', 'integer'),
        col('updated_at', 'text', { notNull: true, default: now }),
      ],
      foreignKeys: [
        {
          columns: ['owner_id'],
          table: 'users',
          foreignColumns: ['id'],
          onDelete: 'set null',
          onUpdate: 'no action',
        },
      ],
      indexes: [{ name: 'deals_owner_idx', columns: ['owner_id'], unique: false }],
    }),
  ],
  [
    'notes',
    liveTable({
      name: 'notes',
      rows: 12,
      columns: [
        col('id', 'integer', { primaryKey: true, notNull: true }),
        col('body'),
        col('created_at', 'text', { notNull: true, default: now }),
        col('legacy', 'text', { notNull: true }),
      ],
    }),
  ],
]);

const code = (): Record<string, RawTable> => ({
  deals: {
    name: 'deals',
    columns: {
      id: { name: 'id', type: 'integer', primaryKey: true, notNull: true },
      title: { name: 'title', type: 'text', notNull: true },
      stage: { name: 'stage', type: 'text', notNull: true, default: 'lead' },
      region: { name: 'region', type: 'text', notNull: true },
      updatedAt: {
        name: 'updated_at',
        type: 'timestamp',
        notNull: true,
        defaultNow: true,
      },
    },
  },
  users: {
    name: 'users',
    columns: { id: { name: 'id', type: 'integer', primaryKey: true } },
  },
  memos: {
    name: 'memos',
    columns: { body: { name: 'body', type: 'text', notNull: true } },
  },
});

describe('reconcile', () => {
  it('keeps every live column and table the code lacks, and reports them', () => {
    const tables = code();
    const kept = reconcile(tables, live);

    expect(kept).toEqual([
      { kind: 'column', table: 'deals', column: 'company' },
      { kind: 'column', table: 'deals', column: 'owner_id' },
      { kind: 'table', table: 'notes' },
    ]);
    expect(tables.deals.columns.__frogbot_kept_company).toEqual({
      name: 'company',
      type: 'text',
      primaryKey: false,
    });
    expect(tables.deals.foreignKeys).toEqual({
      deals_frogbot_kept_0_fk: {
        name: 'deals_frogbot_kept_0_fk',
        columns: ['__frogbot_kept_owner_id'],
        foreignColumns: [{ name: 'id', table: 'users' }],
        onDelete: 'set null',
      },
    });
    expect(tables.deals.indexes).toEqual({
      deals_owner_idx: {
        name: 'deals_owner_idx',
        on: ['__frogbot_kept_owner_id'],
        unique: false,
      },
    });
    expect(tables.notes.columns).toEqual({
      id: { name: 'id', type: 'integer', primaryKey: true },
      body: { name: 'body', type: 'text' },
      created_at: {
        name: 'created_at',
        type: 'timestamp',
        defaultNow: true,
        notNull: true,
      },
      legacy: { name: 'legacy', type: 'text' },
    });
  });

  it('leaves NOT NULL only where it deletes nothing', () => {
    const tables = code();
    reconcile(tables, live);
    const { columns } = tables.deals;

    expect(columns.title.notNull).toBe(true);
    expect(columns.stage.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
    expect(columns.region.notNull).toBe(false);
    expect(tables.memos.columns.body.notNull).toBe(true);
  });

  it('keeps NOT NULL with a default only on a new column, since a rebuild copies nulls as they are', () => {
    const tables = code();

    Object.assign(tables.deals.columns, {
      company: { name: 'company', type: 'text', notNull: true, default: 'x' },
      source: { name: 'source', type: 'text', notNull: true, default: 'web' },
    });

    reconcile(tables, live);

    expect(tables.deals.columns.company.notNull).toBe(false);
    expect(tables.deals.columns.source.notNull).toBe(true);
  });
});

describe('findLosses', () => {
  const rebuild = (columns: string) => [
    'PRAGMA foreign_keys=OFF;',
    'CREATE TABLE `__new_deals` (`id` integer);',
    `INSERT INTO \`__new_deals\`(${columns}) SELECT ${columns} FROM \`deals\`;`,
    'DROP TABLE `deals`;',
    'ALTER TABLE `__new_deals` RENAME TO `deals`;',
    'PRAGMA foreign_keys=ON;',
  ];

  const all = '"id", "company", "title", "stage", "owner_id", "updated_at"';

  it("allows drizzle-kit's rebuild when it copies every live column", () => {
    expect(findLosses(rebuild(all), live)).toEqual([]);
  });

  it('names a column a rebuild leaves behind', () => {
    expect(findLosses(rebuild('"id", "title", "stage", "owner_id", "updated_at"'), live)).toEqual([
      { kind: 'column', table: 'deals', column: 'company' },
    ]);
  });

  it('refuses dropped columns and tables, and deleted rows', () => {
    expect(
      findLosses(
        [
          'ALTER TABLE `deals` DROP COLUMN `company`;',
          'DROP TABLE `notes`;',
          'delete from `deals`;',
          'ALTER TABLE `deals` ADD `region` text;',
          'DROP INDEX `deals_owner_idx`;',
        ],
        live,
      ),
    ).toEqual([
      { kind: 'column', table: 'deals', column: 'company' },
      { kind: 'table', table: 'notes' },
      { kind: 'rows', table: 'deals' },
    ]);
  });
});

describe('findTypeChanges', () => {
  const rebuild = (columns: string) =>
    `CREATE TABLE \`__new_deals\` (\n\t\`id\` integer PRIMARY KEY NOT NULL,\n${columns},\n\tFOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null\n);\n`;

  it('finds a text column a rebuild makes numeric', () => {
    expect(
      findTypeChanges(
        [rebuild('\t`company` numeric,\n\t`title` text NOT NULL,\n\t`owner_id` integer')],
        live,
      ),
    ).toEqual([{ table: 'deals', column: 'company', from: 'text', to: 'numeric' }]);
  });

  it('lets a number become text, and ignores tables that are not live', () => {
    const schema: LiveSchema = new Map([
      [
        'deals',
        liveTable({ name: 'deals', columns: [col('id', 'integer'), col('company', 'numeric')] }),
      ],
    ]);

    expect(findTypeChanges([rebuild('\t`company` text')], schema)).toEqual([]);
    expect(findTypeChanges([rebuild('\t`company` numeric')], new Map())).toEqual([]);
  });

  it("follows SQLite's affinity rules", () => {
    expect(['integer', 'text(36)', 'numeric', 'real', 'blob', 'varchar(9)'].map(affinity)).toEqual([
      'integer',
      'text',
      'numeric',
      'real',
      'blob',
      'text',
    ]);
  });
});

describe('withoutKeptTables', () => {
  it('leaves a kept table alone: no rebuild, no index statements, no empty pragma pair', () => {
    const schema: LiveSchema = new Map([
      [
        '_deals_v',
        liveTable({
          name: '_deals_v',
          indexSql: new Map([['_deals_v_parent_idx', 'CREATE INDEX x']]),
        }),
      ],
    ]);

    const statements = [
      'PRAGMA foreign_keys=OFF;',
      'CREATE TABLE `__new__deals_v` (`id` integer);',
      'INSERT INTO `__new__deals_v`("id") SELECT "id" FROM `_deals_v`;',
      'DROP TABLE `_deals_v`;',
      'ALTER TABLE `__new__deals_v` RENAME TO `_deals_v`;',
      'PRAGMA foreign_keys=ON;',
      'DROP INDEX `_deals_v_parent_idx`;',
      'CREATE INDEX `_deals_v_parent_idx` ON `_deals_v` (`parent_id`);',
      'ALTER TABLE `deals` ADD `region` text;',
    ];

    expect(withoutKeptTables(statements, new Set(['_deals_v']), schema)).toEqual([
      'ALTER TABLE `deals` ADD `region` text;',
    ]);
    expect(withoutKeptTables(statements.slice(0, 6), new Set(['_deals_v']), schema)).toEqual([]);
    expect(withoutKeptTables(statements, new Set(), schema)).toEqual(statements);
  });
});

describe('withoutNoOps', () => {
  it('drops an index drop when the same push recreates it as it is', () => {
    const sql =
      'CREATE UNIQUE INDEX `jobs_live_idx` ON `deals` (`title`) WHERE "deals"."title" is not null';

    const schema: LiveSchema = new Map([
      [
        'deals',
        liveTable({
          name: 'deals',
          indexSql: new Map([['jobs_live_idx', sql]]),
        }),
      ],
    ]);

    expect(withoutNoOps(['DROP INDEX `jobs_live_idx`;', `${sql};`], schema)).toEqual([]);
    expect(
      withoutNoOps(
        [
          'DROP INDEX `jobs_live_idx`;',
          'CREATE UNIQUE INDEX `jobs_live_idx` ON `deals` (`stage`);',
        ],
        schema,
      ),
    ).toHaveLength(2);
  });
});

describe('sqliteAdapter syncSchema', () => {
  it('is set for a file database without prodMigrations', () => {
    expect(sqliteAdapter({ client: { url: 'file:./frogbot.db' } }).syncSchema).toBeTypeOf(
      'function',
    );
  });

  it.each([':memory:', 'file::memory:', 'file:shared?mode=memory', 'libsql://app.turso.io'])(
    'is unset for %s',
    (url) => {
      expect(sqliteAdapter({ client: { url } }).syncSchema).toBeUndefined();
    },
  );

  it('is unset with prodMigrations, so Payload migrates on connect', () => {
    expect(
      sqliteAdapter({ client: { url: 'file:./frogbot.db' }, prodMigrations: [] }).syncSchema,
    ).toBeUndefined();
  });
});
