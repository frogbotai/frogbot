import type { LiveColumn, LiveSchema, LiveTable } from './live.js';

/** The part of Payload's drizzle `RawTable` (`@payloadcms/drizzle` types) this step reads and writes. */
export type RawColumn = {
  name: string;
  type: string;
  notNull?: boolean;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  default?: unknown;
  defaultNow?: boolean;
  [key: string]: unknown;
};

export type RawForeignKey = {
  name: string;
  columns: string[];
  foreignColumns: { name: string; table: string }[];
  onDelete?: string;
  onUpdate?: string;
};

export type RawIndex = {
  name: string;
  on: string | string[];
  unique?: boolean;
};

export type RawTable = {
  name: string;
  columns: Record<string, RawColumn>;
  foreignKeys?: Record<string, RawForeignKey>;
  indexes?: Record<string, RawIndex>;
};

export type Kept =
  { kind: 'table'; table: string } | { kind: 'column'; table: string; column: string };

const nowDefault = /^\(?strftime\('%Y-%m-%dT%H:%M:%fZ', 'now'\)\)?$/;

const keptKey = (column: string) => `__frogbot_kept_${column}`;

function keptColumn(live: LiveColumn, autoIncrement: boolean): RawColumn {
  const column: RawColumn = { name: live.name, type: 'text' };
  if (live.type === 'integer') column.type = 'integer';
  else if (live.type === 'numeric' || live.type === 'real') column.type = 'numeric';
  else if (live.type === 'text(36)') column.type = 'uuid';

  if (live.primaryKey) {
    column.primaryKey = true;
    if (autoIncrement && column.type === 'integer') column.autoIncrement = true;
  }

  const value = live.default;
  if (value !== null && nowDefault.test(value)) {
    column.type = 'timestamp';
    column.defaultNow = true;
  } else if (value !== null) {
    if (/^'.*'$/s.test(value)) column.default = value.slice(1, -1).replaceAll("''", "'");
    else if (/^-?\d+(\.\d+)?$/.test(value)) column.default = Number(value);
    else if (value === 'true' || value === 'false') column.default = value === 'true';
  }

  if (live.notNull && (column.default !== undefined || column.defaultNow)) {
    column.notNull = true;
  }

  return column;
}

const keyOf = (table: RawTable | undefined, column: string) =>
  table ? Object.entries(table.columns).find(([, raw]) => raw.name === column)?.[0] : undefined;

function keepForeignKeys(
  raw: RawTable,
  live: LiveTable,
  tables: Map<string, RawTable>,
  only?: Set<string>,
) {
  live.foreignKeys.forEach((fk, i) => {
    if (only && !fk.columns.some((column) => only.has(column))) return;
    const target = tables.get(fk.table);
    const columns = fk.columns.map((column) => keyOf(raw, column));
    const foreignColumns = fk.foreignColumns.map((column) => keyOf(target, column));
    if (columns.includes(undefined) || foreignColumns.includes(undefined)) return;

    const key: RawForeignKey = {
      name: `${live.name}_frogbot_kept_${i}_fk`,
      columns: columns as string[],
      foreignColumns: (foreignColumns as string[]).map((name) => ({
        name,
        table: fk.table,
      })),
    };

    if (fk.onDelete !== 'no action') key.onDelete = fk.onDelete;
    raw.foreignKeys = { ...raw.foreignKeys, [key.name]: key };
  });
}

function keepIndexes(raw: RawTable, live: LiveTable, only?: Set<string>) {
  const names = new Set(Object.values(raw.indexes ?? {}).map(({ name }) => name));

  for (const index of live.indexes) {
    if (names.has(index.name)) continue;
    if (only && !index.columns.some((column) => only.has(column))) continue;
    const on = index.columns.map((column) => keyOf(raw, column));
    if (on.includes(undefined)) continue;

    raw.indexes = {
      ...raw.indexes,
      [index.name]: {
        name: index.name,
        on: on as string[],
        unique: index.unique,
      },
    };
  }
}

/**
 * Makes Payload's raw schema additive-only against the live database, in place:
 * - every live table and column the code lacks comes back with its live type, nullable, so push never drops one
 *   and drizzle-kit's rename pickers, which open only when one diff creates and deletes, never open;
 * - `NOT NULL` stays only on primary keys, columns already `NOT NULL`, new columns with a default, and new tables,
 *   so `required` never makes push delete rows or rebuild a table to tighten it.
 */
export function reconcile(tables: Record<string, RawTable>, live: LiveSchema): Kept[] {
  const kept: Kept[] = [];
  const byName = new Map(Object.values(tables).map((raw) => [raw.name, raw]));

  for (const raw of byName.values()) {
    const liveTable = live.get(raw.name);
    if (!liveTable) continue;
    const liveColumns = new Map(liveTable.columns.map((column) => [column.name, column]));

    for (const column of Object.values(raw.columns)) {
      if (!column.notNull || column.primaryKey) continue;
      const hasDefault = column.default !== undefined || column.defaultNow === true;
      const liveColumn = liveColumns.get(column.name);
      if (liveColumn ? !liveColumn.notNull : !hasDefault) column.notNull = false;
    }
  }

  for (const liveTable of live.values()) {
    const raw = byName.get(liveTable.name);
    if (raw) {
      const known = new Set(Object.values(raw.columns).map(({ name }) => name));
      const missing = liveTable.columns.filter(({ name }) => !known.has(name));

      for (const column of missing) {
        raw.columns[keptKey(column.name)] = {
          ...keptColumn(column, false),
          primaryKey: false,
        };

        kept.push({ kind: 'column', table: raw.name, column: column.name });
      }

      continue;
    }

    const table: RawTable = {
      name: liveTable.name,
      columns: Object.fromEntries(
        liveTable.columns.map((column) => [
          column.name,
          keptColumn(column, liveTable.autoIncrement),
        ]),
      ),
    };

    tables[liveTable.name] = table;
    byName.set(liveTable.name, table);
    kept.push({ kind: 'table', table: liveTable.name });
  }

  for (const liveTable of live.values()) {
    const raw = byName.get(liveTable.name)!;
    const isKept = kept.some((item) => item.kind === 'table' && item.table === liveTable.name);
    const only = isKept
      ? undefined
      : new Set(
          kept.flatMap((item) =>
            item.kind === 'column' && item.table === liveTable.name ? [item.column] : [],
          ),
        );

    if (only?.size === 0) continue;
    keepForeignKeys(raw, liveTable, byName, only);
    keepIndexes(raw, liveTable, only);
  }

  return kept;
}
