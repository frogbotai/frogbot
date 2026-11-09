import type { LiveSchema } from './live.js';

export type Loss =
  | { kind: 'column'; table: string; column: string }
  | { kind: 'table'; table: string }
  | { kind: 'rows'; table: string };

const id = String.raw`"((?:[^"]|"")+)"`;
const table = String.raw`(?:${id}\.)?${id}`;
const unquote = (name: string) => name.replaceAll('""', '"');

const dropColumn = new RegExp(
  String.raw`^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?${table}\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?${id}`,
  'i',
);

const dropTable = new RegExp(String.raw`^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?${table}`, 'i');
const deleteFrom = new RegExp(String.raw`^\s*DELETE\s+FROM\s+${table}`, 'i');
const truncate = new RegExp(String.raw`^\s*TRUNCATE\s+(?:TABLE\s+)?${table}`, 'i');

const setType = new RegExp(
  String.raw`^\s*ALTER\s+TABLE\s+${table}\s+ALTER\s+COLUMN\s+${id}\s+SET\s+DATA\s+TYPE\s+([^;]+?)(?:\s+USING\s+[^;]*)?;?\s*$`,
  'i',
);

const dropType = new RegExp(String.raw`^\s*DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?${table}`, 'i');
const createType = new RegExp(String.raw`^\s*CREATE\s+TYPE\s+${table}`, 'i');

const tableOf = (match: RegExpExecArray) => unquote(match[2]);

function rebuiltEnums(statements: string[]): Set<string> {
  const dropped = new Set(statements.flatMap((s) => dropType.exec(s)?.slice(2, 3) ?? []));

  return new Set(
    statements.flatMap((s) => {
      const name = createType.exec(s)?.[2];

      return name && dropped.has(name) ? [unquote(name)] : [];
    }),
  );
}

export type TypeChange = { table: string; column: string; from: string; to: string; rows: number };

/** Columns of tables with rows whose type a statement changes, other than an enum losing an option. */
export function findTypeChanges(statements: string[], live: LiveSchema): TypeChange[] {
  const rebuilt = rebuiltEnums(statements);
  const changes: TypeChange[] = [];

  for (const statement of statements) {
    const match = setType.exec(statement);

    if (!match) continue;

    const liveTable = live.get(tableOf(match));
    const column = unquote(match[3]);
    const current = liveTable?.columns.find(({ name }) => name === column);

    if (!liveTable?.rows || !current) continue;

    const to = match[4].trim();
    const target = /"((?:[^"]|"")+)"\s*$/.exec(to)?.[1];
    const isRebuild =
      (current.enumValues && rebuilt.has(current.udt) && /^text$/i.test(to)) ||
      (target !== undefined && rebuilt.has(unquote(target)));

    if (isRebuild) continue;
    if (changes.some((change) => change.table === liveTable.name && change.column === column)) {
      continue;
    }

    changes.push({ table: liveTable.name, column, from: current.type, to, rows: liveTable.rows });
  }

  return changes;
}

/**
 * What a push would delete: a dropped column or table, deleted rows, or a truncate, which drizzle-kit adds
 * before a type change on a table with rows (that one is a type change, refused on its own).
 */
export function findLosses(statements: string[], live: LiveSchema): Loss[] {
  const typeChanged = new Set(findTypeChanges(statements, live).map((change) => change.table));
  const losses: Loss[] = [];

  for (const statement of statements) {
    const column = dropColumn.exec(statement);

    if (column) {
      losses.push({ kind: 'column', table: tableOf(column), column: unquote(column[3]) });
      continue;
    }

    const rows = deleteFrom.exec(statement) ?? truncate.exec(statement);

    if (rows) {
      if (!typeChanged.has(tableOf(rows))) losses.push({ kind: 'rows', table: tableOf(rows) });
      continue;
    }

    const dropped = dropTable.exec(statement);

    if (dropped) losses.push({ kind: 'table', table: tableOf(dropped) });
  }

  return losses;
}

const createIndex = new RegExp(
  String.raw`^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?${id}\s+ON\s+(?:ONLY\s+)?${table}(?:\s+USING\s+\w+)?\s*\(([^;]*)\)`,
  'i',
);

export type NewUnique = { table: string; columns: string[] };

/** Unique indexes this push adds to tables that already have rows. */
export function findNewUniques(statements: string[], live: LiveSchema): NewUnique[] {
  return statements.flatMap((statement) => {
    const match = createIndex.exec(statement);

    if (!match?.[1]) return [];

    const liveTable = live.get(unquote(match[4]));

    if (!liveTable?.rows) return [];

    const columns = [...match[5].matchAll(/"((?:[^"]|"")+)"/g)].map(([, name]) => unquote(name));
    const existing = new Set(liveTable.columns.map(({ name }) => name));

    if (!columns.length || columns.some((column) => !existing.has(column))) return [];

    return [{ table: liveTable.name, columns }];
  });
}

const setDefault = new RegExp(
  String.raw`^\s*ALTER\s+TABLE\s+${table}\s+ALTER\s+COLUMN\s+${id}\s+SET\s+DEFAULT\s+([^;]+?);?\s*$`,
  'i',
);

const bareDefault = (value: string) =>
  value
    .trim()
    .replace(/(::[\w\s."]+(?:\[\])?)+$/, '')
    .replace(/^\((.*)\)$/s, '$1')
    .replace(/^'(-?\d+(?:\.\d+)?)'$/, '$1');

/**
 * Drops `SET DEFAULT x` on a column whose default already is `x`: drizzle-kit reads a numeric default back
 * differently from how it writes it, so it resets `users.login_attempts` and the like on every push.
 */
export function withoutNoOps(statements: string[], live: LiveSchema): string[] {
  return statements.filter((statement) => {
    const match = setDefault.exec(statement);

    if (!match) return true;

    const current = live
      .get(tableOf(match))
      ?.columns.find(({ name }) => name === unquote(match[3]))?.default;

    return (
      current === undefined || current === null || bareDefault(current) !== bareDefault(match[4])
    );
  });
}

const statementTable = [
  new RegExp(String.raw`^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${table}`, 'i'),
  new RegExp(String.raw`^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?${table}`, 'i'),
  dropTable,
  truncate,
  deleteFrom,
];

const dropIndex = new RegExp(String.raw`^\s*DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?${table}`, 'i');
const alterColumn = new RegExp(
  String.raw`^\s*ALTER\s+TABLE\s+${table}\s+ALTER\s+COLUMN\s+${id}\s+(SET\s+DATA\s+TYPE|SET\s+DEFAULT|DROP\s+DEFAULT)\b`,
  'i',
);

const statementTableName = (statement: string) => {
  for (const pattern of statementTable) {
    const match = pattern.exec(statement);

    if (match) return tableOf(match);
  }

  const index = createIndex.exec(statement);

  return index ? unquote(index[4]) : undefined;
};

/**
 * Drops every statement that would touch a kept table (one the code no longer has), so it stays exactly as it
 * is, and every type or default change on a kept column with the truncate drizzle-kit puts before a type change:
 * a kept column keeps its live type and default even where FrogBot's raw schema can't spell them.
 */
export function withoutKept(
  statements: string[],
  keptTables: Set<string>,
  keptColumns: Set<string>,
  live: LiveSchema,
): string[] {
  if (!keptTables.size && !keptColumns.size) return statements;

  const keptNames = new Set([...keptTables].flatMap((name) => [...(live.get(name)?.names ?? [])]));

  const skipped = new Set<number>();

  statements.forEach((statement, i) => {
    const index = dropIndex.exec(statement);

    if (index) {
      if (keptNames.has(tableOf(index))) skipped.add(i);

      return;
    }

    const name = statementTableName(statement);

    if (name !== undefined && keptTables.has(name)) {
      skipped.add(i);

      return;
    }

    const column = alterColumn.exec(statement);

    if (!column || !keptColumns.has(`${tableOf(column)}.${unquote(column[3])}`)) return;

    skipped.add(i);

    const before = truncate.exec(statements[i - 1] ?? '');

    if (/^SET\s+DATA\s+TYPE/i.test(column[4]) && before && tableOf(before) === tableOf(column)) {
      skipped.add(i - 1);
    }
  });

  return statements.filter((_, i) => !skipped.has(i));
}
