import { type SQL, sql } from 'drizzle-orm';

import type { SearchTarget } from '../types.js';
import { buildRowSource, getDocumentID } from './buildRowSource.js';

export function buildLexicalQuery({
  filter,
  limit,
  locale,
  match,
  target,
}: {
  filter?: SQL;
  limit: number;
  locale: string;
  match: string;
  target: SearchTarget;
}): SQL {
  const fts = sql.identifier(target.lexical!.table);
  const id = getDocumentID(target);

  const source = buildRowSource({
    key: target.lexical!.key,
    locale,
    rowID: sql`${fts}.rowid`,
    target,
  });

  return sql`SELECT ${id} AS "id", -${fts}.rank AS "score" FROM ${fts} ${source} WHERE ${fts} MATCH ${match}${filter ? sql` AND ${filter}` : sql``} ORDER BY ${fts}.rank, ${id} LIMIT ${limit}`;
}
