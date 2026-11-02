import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export type LiveColumn = {
  name: string;
  /** The declared type, lowercased: `integer`, `text`, `numeric`, `text(36)`… */
  type: string;
  notNull: boolean;
  /** The default as SQLite stores it, an SQL expression such as `'lead'`. */
  default: string | null;
  primaryKey: boolean;
};

export type LiveForeignKey = {
  columns: string[];
  table: string;
  foreignColumns: string[];
  onDelete: string;
  onUpdate: string;
};

export type LiveIndex = {
  name: string;
  columns: string[];
  unique: boolean;
};

export type LiveTable = {
  name: string;
  columns: LiveColumn[];
  foreignKeys: LiveForeignKey[];
  indexes: LiveIndex[];
  autoIncrement: boolean;
  rows: number;
  /** Each index's `CREATE INDEX` text, partial ones included. */
  indexSql: Map<string, string>;
};

export type LiveSchema = Map<string, LiveTable>;

/**
 * Tables push never manages: drizzle-kit's own skip list (`filterIgnoredTablesByField` in `drizzle-kit/api.js`),
 * plus FrogBot's search tables, which FrogBot's `pushSearchSchema` rebuilds itself.
 */
export const isUnmanagedTable = (name: string): boolean =>
  name === '__drizzle_migrations' ||
  /^(_cf_|_litestream_|libsql_|sqlite_|frogbot_search_)/.test(name);

/** `file:/data/frogbot.db` → `/data/frogbot.db`; anything else (a remote libSQL URL, `:memory:`) has no file. */
export function databasePath(url: string | undefined): string | undefined {
  if (!url?.startsWith('file:')) return undefined;
  const path = url.slice('file:'.length).split('?')[0];

  return path && path !== ':memory:' ? decodeURIComponent(path) : undefined;
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

type Row = Record<string, unknown>;

/** Reads every table push compares, without writing: an empty map when there is no database yet. */
export function readLiveSchema(path: string | undefined): LiveSchema {
  const schema: LiveSchema = new Map();
  if (!path || !existsSync(path)) return schema;

  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const all = (sql: string) => db.prepare(sql).all() as Row[];
    const tables = all(`SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`);

    for (const { name, sql } of tables) {
      const table = String(name);
      if (isUnmanagedTable(table)) continue;

      const columns = all(`PRAGMA table_xinfo(${quote(table)})`)
        .filter((column) => Number(column.hidden) === 0)
        .map((column): LiveColumn => ({
          name: String(column.name),
          type: String(column.type ?? '').toLowerCase(),
          notNull: Number(column.notnull) === 1,
          default: column.dflt_value === null ? null : String(column.dflt_value),
          primaryKey: Number(column.pk) > 0,
        }));

      const keys = new Map<number, LiveForeignKey>();

      for (const fk of all(`PRAGMA foreign_key_list(${quote(table)})`)) {
        const id = Number(fk.id);
        const entry = keys.get(id) ?? {
          columns: [],
          table: String(fk.table),
          foreignColumns: [],
          onDelete: String(fk.on_delete).toLowerCase(),
          onUpdate: String(fk.on_update).toLowerCase(),
        };

        entry.columns.push(String(fk.from));
        entry.foreignColumns.push(String(fk.to));
        keys.set(id, entry);
      }

      const indexes: LiveIndex[] = [];

      for (const index of all(`PRAGMA index_list(${quote(table)})`)) {
        if (index.origin !== 'c' || Number(index.partial) === 1) continue;
        const parts = all(`PRAGMA index_info(${quote(String(index.name))})`);
        if (parts.some((part) => part.name === null)) continue;

        indexes.push({
          name: String(index.name),
          columns: parts.map((part) => String(part.name)),
          unique: Number(index.unique) === 1,
        });
      }

      const indexSql = new Map(
        db
          .prepare(
            `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
          )
          .all(table)
          .map((row) => [String(row.name), String(row.sql)] as const),
      );

      const [{ rows }] = all(`SELECT count(*) AS rows FROM ${quote(table)}`);

      schema.set(table, {
        name: table,
        columns,
        foreignKeys: [...keys.values()],
        indexes,
        autoIncrement: /\bautoincrement\b/i.test(String(sql)),
        rows: Number(rows),
        indexSql,
      });
    }
  } finally {
    db.close();
  }

  return schema;
}

/** How many rows of `table` hold a value in `column`. */
export function countValues(path: string | undefined, table: string, column: string): number {
  if (!path || !existsSync(path)) return 0;
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare(`SELECT count(${quote(column)}) AS n FROM ${quote(table)}`).get() as Row;

    return Number(row.n);
  } finally {
    db.close();
  }
}
