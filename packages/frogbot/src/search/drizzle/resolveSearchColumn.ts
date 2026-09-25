import type { DrizzleAdapter } from '@payloadcms/drizzle';

import { getSearchTableName } from './getSearchTableName.js';

export type SearchColumn = {
  key: string;
  tableName: string;
};

export function resolveSearchColumn({
  adapter,
  collection,
  path,
  versions,
}: {
  adapter: DrizzleAdapter;
  collection: string;
  path: string;
  versions: boolean;
}): SearchColumn | undefined {
  const tableName = getSearchTableName({ adapter, collection, versions });

  if (!tableName) return undefined;

  const key = `${versions ? 'version_' : ''}${path.replaceAll('.', '_')}`;

  for (const candidate of [tableName, `${tableName}${adapter.localesSuffix ?? ''}`]) {
    if (adapter.rawTables[candidate]?.columns[key]) return { key, tableName: candidate };
  }

  return undefined;
}
