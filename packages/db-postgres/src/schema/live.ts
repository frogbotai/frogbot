export type LiveColumn = {
  name: string;
  /** The type as `format_type` prints it: `character varying`, `numeric`, `timestamp(3) with time zone`… */
  type: string;
  /** The values of an enum column's type, in order; `undefined` for any other column. */
  enumValues?: string[];
  /** The type's own name: an enum's `enum_deals_stage`, or `varchar`, `int4`… */
  udt: string;
  notNull: boolean;
  /** The default as Postgres prints it, an SQL expression such as `'lead'::enum_deals_stage`. */
  default: string | null;
  primaryKey: boolean;
};

export type LiveForeignKey = {
  name: string;
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
  /** Plain btree indexes on columns; expression, partial and other indexes are left out. */
  indexes: LiveIndex[];
  /** Every index and constraint name on the table, so a statement dropping one can be told apart. */
  names: Set<string>;
  rows: number;
};

export type LiveSchema = Map<string, LiveTable>;

type Row = Record<string, unknown>;

/** Runs one query on the sync's checked-out client. */
export type Query = (sql: string, args?: unknown[]) => Promise<Row[]>;

type Client = { query: (sql: string, args?: unknown[]) => Promise<{ rows: Row[] }> };

export const clientQuery =
  (client: Client): Query =>
  async (sql, args = []) =>
    (await client.query(sql, args)).rows;

export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

const isUnmanagedTable = (name: string) => name === '__drizzle_migrations';

const actions: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default',
};

const columnNames = (keys: string, table: string) =>
  `ARRAY(SELECT a.attname FROM unnest(${keys}::int2[]) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = ${table} AND a.attnum = k.n ORDER BY k.i)::text[]`;

const strings = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

/** Reads every table of `schemaName` that push compares, without writing. */
export async function readLiveSchema(query: Query, schemaName: string): Promise<LiveSchema> {
  const schema: LiveSchema = new Map();

  const tables = await query(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
     ORDER BY c.relname`,
    [schemaName],
  );

  for (const { name } of tables) {
    const table = String(name);

    if (isUnmanagedTable(table)) continue;

    const [{ rows }] = await query(
      `SELECT count(*)::int AS rows FROM ${quote(schemaName)}.${quote(table)}`,
    );

    schema.set(table, {
      name: table,
      columns: [],
      foreignKeys: [],
      indexes: [],
      names: new Set(),
      rows: Number(rows),
    });
  }

  const enums = new Map<string, string[]>();

  for (const row of await query(
    `SELECT t.typname AS name, e.enumlabel AS value FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = $1 ORDER BY t.typname, e.enumsortorder`,
    [schemaName],
  )) {
    enums.set(String(row.name), [...(enums.get(String(row.name)) ?? []), String(row.value)]);
  }

  const primary = new Set<string>();

  for (const row of await query(
    `SELECT c.relname AS table, con.conname AS name, con.contype AS type, f.relname AS foreign_table,
       con.confdeltype AS on_delete, con.confupdtype AS on_update,
       ${columnNames('con.conkey', 'con.conrelid')} AS columns,
       ${columnNames('con.confkey', 'con.confrelid')} AS foreign_columns
     FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_class f ON f.oid = con.confrelid
     WHERE n.nspname = $1 ORDER BY con.conname`,
    [schemaName],
  )) {
    const table = schema.get(String(row.table));

    if (!table) continue;

    table.names.add(String(row.name));

    if (row.type === 'p') {
      for (const column of strings(row.columns)) primary.add(`${table.name}.${column}`);
    }

    if (row.type === 'f') {
      table.foreignKeys.push({
        name: String(row.name),
        columns: strings(row.columns),
        table: String(row.foreign_table),
        foreignColumns: strings(row.foreign_columns),
        onDelete: actions[String(row.on_delete)] ?? 'no action',
        onUpdate: actions[String(row.on_update)] ?? 'no action',
      });
    }
  }

  for (const row of await query(
    `SELECT c.relname AS table, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
       t.typname AS udt, t.typtype AS kind, a.attnotnull AS not_null,
       pg_get_expr(d.adbin, d.adrelid) AS "default"
     FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_type t ON t.oid = a.atttypid
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY c.relname, a.attnum`,
    [schemaName],
  )) {
    const table = schema.get(String(row.table));

    if (!table) continue;

    const column: LiveColumn = {
      name: String(row.name),
      type: String(row.type).toLowerCase(),
      udt: String(row.udt),
      notNull: row.not_null === true,
      default: row.default === null ? null : String(row.default),
      primaryKey: primary.has(`${table.name}.${String(row.name)}`),
    };

    if (row.kind === 'e') column.enumValues = enums.get(column.udt) ?? [];

    table.columns.push(column);
  }

  for (const row of await query(
    `SELECT t.relname AS table, i.relname AS name, ix.indisunique AS unique, am.amname AS method,
       ix.indnatts AS count, (ix.indexprs IS NULL AND ix.indpred IS NULL) AS plain,
       EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = ix.indexrelid) AS constraint,
       ${columnNames('ix.indkey', 'ix.indrelid')} AS columns
     FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_am am ON am.oid = i.relam
     WHERE n.nspname = $1 ORDER BY i.relname`,
    [schemaName],
  )) {
    const table = schema.get(String(row.table));

    if (!table) continue;

    table.names.add(String(row.name));

    const columns = strings(row.columns);

    if (
      row.constraint === true ||
      row.plain !== true ||
      row.method !== 'btree' ||
      columns.length !== Number(row.count)
    ) {
      continue;
    }

    table.indexes.push({ name: String(row.name), columns, unique: row.unique === true });
  }

  return schema;
}

/** How many rows of `table` hold a value in `column`. */
export async function countValues(
  query: Query,
  schemaName: string,
  table: string,
  column: string,
): Promise<number> {
  const [row] = await query(
    `SELECT count(${quote(column)})::int AS n FROM ${quote(schemaName)}.${quote(table)}`,
  );

  return Number(row.n);
}

/** How many rows of `table` repeat a value of `columns` that an earlier row holds; rows with a null in them never clash. */
export async function countDuplicates(
  query: Query,
  schemaName: string,
  table: string,
  columns: string[],
): Promise<number> {
  const list = columns.map(quote).join(', ');
  const present = columns.map((column) => `${quote(column)} IS NOT NULL`).join(' AND ');
  const [row] = await query(
    `SELECT coalesce(sum(n - 1), 0)::int AS n FROM (SELECT count(*) AS n FROM ${quote(schemaName)}.${quote(table)} WHERE ${present} GROUP BY ${list} HAVING count(*) > 1) d`,
  );

  return Number(row.n);
}
