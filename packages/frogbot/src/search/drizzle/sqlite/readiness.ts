import { sql } from 'drizzle-orm';

import type { SearchReadiness } from '../../../database/types.js';
import { SearchReadinessError } from '../../errors.js';
import { assertSQLiteSearchAdapter, getSearchDatabase } from './guards.js';
import { buildSearchObjects } from './schema/buildSearchObjects.js';
import { getSearchTargets } from './schema/getSearchSchema.js';

export const readiness: SearchReadiness = async ({ collection, db, index, mode }) => {
  const adapter = assertSQLiteSearchAdapter(db);
  const targets = getSearchTargets({ adapter, collection, index });

  if (mode === 'vector' && !targets.some(({ vector }) => vector?.index)) return;

  const objects = targets.flatMap((target) => buildSearchObjects(target)?.objects ?? []);

  if (!objects.length) return;

  const rows = await getSearchDatabase(adapter.drizzle).all<{ name: string; sql: string }>(
    sql`SELECT "name", "sql" FROM sqlite_master WHERE "name" IN (${sql.join(
      objects.map(({ name }) => sql`${name}`),
      sql`, `,
    )})`,
  );

  const built = new Map(rows.map((row) => [row.name, row.sql]));

  if (objects.some(({ name, sql: text }) => built.get(name) !== text)) {
    throw new SearchReadinessError(
      `Search index '${index.name}' in collection '${collection}' is not built for the current configuration. Run your migrations.`,
    );
  }
};
