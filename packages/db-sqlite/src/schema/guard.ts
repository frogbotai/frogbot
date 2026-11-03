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

export type TypeChange = { table: string; column: string; from: string; to: string };

const createNew = new RegExp(
  String.raw`^\s*CREATE\s+TABLE\s+[\`"]?__new_([^\`"\s;(]+)[\`"]?\s*\(([\s\S]*)\)\s*;?\s*$`,
  'i',
);

const columnDefinition = /(?:^|[(,])\s*[`"]([^`"]+)[`"]\s+([a-z]+(?:\s*\(\s*\d+\s*\))?)/gi;

/** SQLite's type affinity rules (https://www.sqlite.org/datatype3.html#determination_of_column_affinity). */
export function affinity(type: string): 'integer' | 'text' | 'blob' | 'real' | 'numeric' {
  const declared = type.toLowerCase();

  if (declared.includes('int')) return 'integer';
  if (/char|clob|text/.test(declared)) return 'text';
  if (declared === '' || declared.includes('blob')) return 'blob';
  if (/real|floa|doub/.test(declared)) return 'real';

  return 'numeric';
}

const isNumeric = (type: string) => ['integer', 'real', 'numeric'].includes(affinity(type));

/**
 * Columns a drizzle-kit table rebuild (`CREATE TABLE __new_<t>`) moves from a text affinity to a
 * numeric one: text that isn't a number stays text there, and Payload reads it back as `null`.
 */
export function findTypeChanges(statements: string[], live: LiveSchema): TypeChange[] {
  const changes: TypeChange[] = [];

  for (const statement of statements) {
    const match = createNew.exec(statement);

    if (!match) continue;

    const table = live.get(match[1]);

    if (!table) continue;

    const current = new Map(table.columns.map((column) => [column.name, column.type]));

    for (const [, column, to] of match[2].matchAll(columnDefinition)) {
      const from = current.get(column);

      if (from !== undefined && !isNumeric(from) && isNumeric(to)) {
        changes.push({ table: table.name, column, from, to: to.toLowerCase() });
      }
    }
  }

  return changes;
}

const statementTable = [
  /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(?:__new_)?([^`"\s;(]+)/i,
  /^\s*INSERT\s+INTO\s+[`"]?__new_([^`"\s;(]+)/i,
  /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?([^`"\s;(]+)/i,
  /^\s*ALTER\s+TABLE\s+[`"]?(?:__new_)?([^`"\s;(]+)/i,
  /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s+ON\s+[`"]?([^`"\s;(]+)/i,
];

const isPragma = (statement: string) => /^\s*PRAGMA\b/i.test(statement);

/**
 * Drops every statement that would touch a kept table (one the code no longer has), so it stays exactly
 * as it is: drizzle-kit would otherwise rebuild it, copying every row, to match the loosened schema the
 * reconcile gave it, and recreate its indexes.
 */
export function withoutKeptTables(
  statements: string[],
  kept: Set<string>,
  live: LiveSchema,
): string[] {
  if (!kept.size) return statements;

  const keptIndexes = new Set(
    [...kept].flatMap((table) => [...(live.get(table)?.indexSql.keys() ?? [])]),
  );

  const touches = (statement: string) => {
    const index = dropIndex.exec(statement)?.[1];

    if (index) return keptIndexes.has(index);

    const table = statementTable.map((pattern) => pattern.exec(statement)?.[1]).find(Boolean);

    return table !== undefined && kept.has(table);
  };

  const left = statements.filter((statement) => !touches(statement));

  const paired = left.filter(
    (statement, i) =>
      !(
        /foreign_keys\s*=\s*OFF/i.test(statement) &&
        /foreign_keys\s*=\s*ON/i.test(left[i + 1] ?? '')
      ) &&
      !(
        /foreign_keys\s*=\s*ON/i.test(statement) &&
        /foreign_keys\s*=\s*OFF/i.test(left[i - 1] ?? '')
      ),
  );

  return paired.every(isPragma) ? [] : paired;
}
