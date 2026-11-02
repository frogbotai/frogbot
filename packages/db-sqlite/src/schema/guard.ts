import type { LiveSchema } from './live.js';

export type Loss =
  | { kind: 'column'; table: string; column: string }
  | { kind: 'table'; table: string }
  | { kind: 'rows'; table: string };

const name = String.raw`[\`"]?([^\`"\s;(]+)[\`"]?`;
const dropColumn = new RegExp(
  String.raw`^\s*ALTER\s+TABLE\s+${name}\s+DROP\s+(?:COLUMN\s+)?${name}`,
  'i',
);

const dropTable = new RegExp(String.raw`^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?${name}`, 'i');
const deleteFrom = new RegExp(String.raw`^\s*DELETE\s+FROM\s+${name}`, 'i');
const insertNew = new RegExp(
  String.raw`^\s*INSERT\s+INTO\s+[\`"]?__new_([^\`"\s;(]+)[\`"]?\s*\(([^)]*)\)\s*SELECT\b`,
  'i',
);

const renameNew = new RegExp(
  String.raw`^\s*ALTER\s+TABLE\s+[\`"]?__new_([^\`"\s;(]+)[\`"]?\s+RENAME\s+TO\s+${name}`,
  'i',
);

const columnList = (list: string) =>
  list
    .split(',')
    .map((part) => part.trim().replace(/^[`"]|[`"]$/g, ''))
    .filter(Boolean);

/**
 * What a push would delete: a dropped column, a deleted row, or a dropped table that isn't
 * the middle of drizzle-kit's SQLite rebuild (`INSERT INTO __new_<t> … SELECT` before, `RENAME TO <t>` after),
 * and a rebuild that leaves a live column behind.
 */
export function findLosses(statements: string[], live: LiveSchema): Loss[] {
  const losses: Loss[] = [];

  statements.forEach((statement, i) => {
    const column = dropColumn.exec(statement);
    if (column) {
      losses.push({ kind: 'column', table: column[1], column: column[2] });

      return;
    }

    const rows = deleteFrom.exec(statement);
    if (rows) {
      losses.push({ kind: 'rows', table: rows[1] });

      return;
    }

    const table = dropTable.exec(statement)?.[1];
    if (!table) return;

    const insert = insertNew.exec(statements[i - 1] ?? '');
    const rename = renameNew.exec(statements[i + 1] ?? '');
    const isRebuild = insert?.[1] === table && rename?.[1] === table && rename[2] === table;
    if (!isRebuild) {
      losses.push({ kind: 'table', table });

      return;
    }

    const copied = new Set(columnList(insert[2]));

    for (const { name: liveColumn } of live.get(table)?.columns ?? []) {
      if (!copied.has(liveColumn)) losses.push({ kind: 'column', table, column: liveColumn });
    }
  });

  return losses;
}

const dropIndex = new RegExp(
  String.raw`^\s*DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?${name}\s*;?\s*$`,
  'i',
);

const createIndex = new RegExp(
  String.raw`^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?${name}`,
  'i',
);

/**
 * Drops `DROP INDEX x` when the same push recreates `x` exactly as it is: drizzle-kit can't compare a partial
 * index's `WHERE`, so it rebuilds FrogBot's `payload_jobs_job_id_live_idx` on every push.
 */
export function withoutNoOps(statements: string[], live: LiveSchema): string[] {
  const existing = new Map<string, string>();

  for (const table of live.values()) {
    for (const [index, sql] of table.indexSql) existing.set(index, sql.trim());
  }

  const same = new Set<string>();

  for (const statement of statements) {
    const index = createIndex.exec(statement)?.[1];
    if (index && existing.get(index) === statement.trim().replace(/;$/, '')) same.add(index);
  }

  return statements.filter((statement) => {
    const index = dropIndex.exec(statement)?.[1] ?? createIndex.exec(statement)?.[1];

    return !index || !same.has(index);
  });
}
