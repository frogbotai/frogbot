import type { DrizzleAdapter } from '@payloadcms/drizzle';
import toSnakeCase from 'to-snake-case';

export function getSearchTableName({
  adapter,
  collection,
  versions,
}: {
  adapter: DrizzleAdapter;
  collection: string;
  versions: boolean;
}): string | undefined {
  return adapter.tableNameMap.get(
    versions
      ? `_${toSnakeCase(collection)}${adapter.versionsSuffix ?? ''}`
      : toSnakeCase(collection),
  );
}
