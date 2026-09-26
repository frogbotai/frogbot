import { sql } from 'drizzle-orm';

import type { SearchDatabase, SearchSchema } from '../types.js';
import { getCreateStatements, getDropStatements, type SearchObjectRow } from './statements.js';

export type PushResult = {
  apply: () => Promise<void>;
  hasDataLoss: boolean;
  statementsToExecute: string[];
  warnings: string[];
};

function isCurrent(rows: SearchObjectRow[], schema: SearchSchema): boolean {
  const objects = Object.values(schema).flatMap(({ objects: items }) => items);
  const expected = new Map(objects.map(({ name, sql: text }) => [name, text]));
  const tables = objects.filter(({ type }) => type === 'table').map(({ name }) => `${name}_`);
  const actual = new Map(rows.map(({ name, sql: text }) => [name, text]));

  return (
    objects.every(({ name, sql: text }) => actual.get(name) === text) &&
    rows.every(
      ({ name, type }) =>
        expected.has(name) ||
        (type === 'table' && tables.some((prefix) => name.startsWith(prefix))),
    )
  );
}

export async function pushSearchSchema({
  drizzle,
  push,
  schema,
}: {
  drizzle: SearchDatabase;
  push: () => Promise<PushResult>;
  schema: SearchSchema;
}): Promise<PushResult> {
  const rows = await drizzle.all<SearchObjectRow>(
    sql`SELECT "type", "name", "tbl_name", "sql" FROM sqlite_master WHERE "name" GLOB 'frogbot_search_*'`,
  );

  const result = await push();
  const managed = new Set(rows.map(({ name }) => name));

  const statementsToExecute = result.statementsToExecute.filter((statement) => {
    const table = /^DROP TABLE `([^`]+)`;?$/.exec(statement.trim())?.[1];

    return !table || !managed.has(table);
  });

  const warnings = result.warnings.filter(
    (warning) => ![...managed].some((name) => warning.includes(` ${name} `)),
  );

  const sources = new Set([
    ...Object.values(schema).flatMap(({ tables }) => tables),
    ...rows.map(({ tbl_name }) => tbl_name),
  ]);

  const rebuild =
    !isCurrent(rows, schema) ||
    statementsToExecute.some((statement) =>
      [...sources].some((table) => statement.includes(`\`${table}\``)),
    );

  const run = async (statements: string[]) => {
    for (const statement of statements) await drizzle.run(sql.raw(statement));
  };

  return {
    apply: async () => {
      if (rebuild) await run(getDropStatements(rows));

      await run(statementsToExecute);

      if (rebuild) await run(Object.values(schema).flatMap(getCreateStatements));
    },
    hasDataLoss: result.hasDataLoss && warnings.length > 0,
    statementsToExecute,
    warnings,
  };
}
