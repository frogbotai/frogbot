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

/** Runs one read-only query on the database file. */
export type Query = (sql: string, args?: string[]) => Promise<Row[]>;

/**
 * Runs `read` on a read-only `node:sqlite` connection to the file at `path`, or with none when there is
 * no file yet. Only for before the adapter connects: closing it while libSQL holds locks on the same file
 * in this process would drop them, so once connected, read through `clientQuery`.
 */
export async function withDatabase<T>(
  path: string | undefined,
  read: (query: Query | undefined) => Promise<T>,
): Promise<T> {
  if (!path || !existsSync(path)) return read(undefined);

  const db = new DatabaseSync(path, { readOnly: true });

  try {
    return await read((sql, args = []) => Promise.resolve(db.prepare(sql).all(...args) as Row[]));
  } finally {
    db.close();
  }
}

type Client = {
  execute: (statement: { sql: string; args: string[] }) => Promise<{ rows: Row[] }>;
};

/** Reads on the adapter's own libSQL connection. */
export const clientQuery =
  (client: Client): Query =>
  async (sql, args = []) =>
    (await client.execute({ sql, args })).rows;

/** Reads every table push compares, without writing: an empty map when there is no database yet. */
export async function readLiveSchema(query: Query | undefined): Promise<LiveSchema> {
  const schema: LiveSchema = new Map();

  if (!query) return schema;

  const tables = await query(
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );

  for (const { name, sql } of tables) {
    const table = String(name);

    if (isUnmanagedTable(table)) continue;

    const columns = (await query(`PRAGMA table_xinfo(${quote(table)})`))
      .filter((column) => Number(column.hidden) === 0)
      .map((column): LiveColumn => ({
        name: String(column.name),
        type: String(column.type ?? '').toLowerCase(),
        notNull: Number(column.notnull) === 1,
        default: column.dflt_value === null ? null : String(column.dflt_value),
        primaryKey: Number(column.pk) > 0,
      }));

    const keys = new Map<number, LiveForeignKey>();

    for (const fk of await query(`PRAGMA foreign_key_list(${quote(table)})`)) {
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

    for (const index of await query(`PRAGMA index_list(${quote(table)})`)) {
      if (index.origin !== 'c' || Number(index.partial) === 1) continue;

      const parts = await query(`PRAGMA index_info(${quote(String(index.name))})`);

      if (parts.some((part) => part.name === null)) continue;

      indexes.push({
        name: String(index.name),
        columns: parts.map((part) => String(part.name)),
        unique: Number(index.unique) === 1,
      });
    }

    const indexSql = new Map(
      (
        await query(
          `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
          [table],
        )
      ).map((row) => [String(row.name), String(row.sql)] as const),
    );

    const [{ rows }] = await query(`SELECT count(*) AS rows FROM ${quote(table)}`);

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

  return schema;
}

/** How many rows of `table` hold a value in `column`. */
export async function countValues(
  query: Query | undefined,
  table: string,
  column: string,
): Promise<number> {
  if (!query) return 0;

  const [row] = await query(`SELECT count(${quote(column)}) AS n FROM ${quote(table)}`);

  return Number(row.n);
}

const number = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?\s*$/i;

/** How many rows of `table` hold text or a blob in `column` that SQLite wouldn't store as a number. */
export async function countNonNumbers(
  query: Query | undefined,
  table: string,
  column: string,
): Promise<number> {
  if (!query) return 0;

  const rows = await query(
    `SELECT ${quote(column)} AS v FROM ${quote(table)} WHERE typeof(${quote(column)}) IN ('text', 'blob')`,
  );

  return rows.filter((row) => typeof row.v !== 'string' || !number.test(row.v)).length;
}
