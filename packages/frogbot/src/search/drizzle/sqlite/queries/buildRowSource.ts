import { type SQL, sql } from 'drizzle-orm';

import type { SearchRowKey, SearchTarget } from '../types.js';

export function getDocumentID(target: SearchTarget): SQL {
  return sql`${sql.identifier(target.table)}.${sql.identifier(target.parent ?? 'id')}`;
}

function getLocaleCondition(target: SearchTarget, locale: string): SQL {
  const { locales } = target;

  return sql`${sql.identifier(locales!.table)}.${sql.identifier(locales!.locale)} = ${locale}`;
}

export function buildRowSource({
  key,
  locale,
  rowID,
  target,
}: {
  key: SearchRowKey;
  locale: string;
  rowID: SQL;
  target: SearchTarget;
}): SQL {
  const source = sql.identifier(target.table);

  if (key === 'keys') {
    const keys = sql.identifier(target.keys!);

    return sql`JOIN ${keys} ON ${keys}."id" = ${rowID} JOIN ${source} ON ${source}."id" = ${keys}."parent"`;
  }

  if (key === 'locales') {
    const locales = sql.identifier(target.locales!.table);

    return sql`JOIN ${locales} ON ${locales}."id" = ${rowID} AND ${getLocaleCondition(target, locale)} JOIN ${source} ON ${source}."id" = ${locales}.${sql.identifier(target.locales!.parent)}`;
  }

  return sql`JOIN ${source} ON ${source}."id" = ${rowID}`;
}
