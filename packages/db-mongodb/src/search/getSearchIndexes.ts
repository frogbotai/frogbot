import type { MongooseAdapter } from '@payloadcms/db-mongodb';

import type { SearchIndex } from './types.js';

const searchIndexes = new WeakMap<object, SearchIndex[]>();

export function getSearchIndexes(adapter: MongooseAdapter): SearchIndex[] {
  return searchIndexes.get(adapter) ?? [];
}

export function setSearchIndexes({
  adapter,
  indexes,
}: {
  adapter: MongooseAdapter;
  indexes: SearchIndex[];
}): void {
  searchIndexes.set(adapter, indexes);
}
