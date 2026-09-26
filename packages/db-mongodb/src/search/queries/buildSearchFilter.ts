import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { Where } from 'payload';
import { appendVersionToQueryKey, combineQueries } from 'payload';

import { getSearchModel } from '../getSearchModel.js';
import type { SearchFilter, SearchIndex } from '../types.js';
import { parseSearchFilter } from './parseSearchFilter.js';

export async function buildSearchFilter({
  adapter,
  locale,
  searchIndex,
  where,
}: {
  adapter: MongooseAdapter;
  locale: string | undefined;
  searchIndex: SearchIndex;
  where: Where;
}): Promise<SearchFilter> {
  const Model = getSearchModel({
    adapter,
    collection: searchIndex.collection,
    versions: searchIndex.versions,
  });

  const query = await Model.buildQuery({
    locale,
    payload: adapter.payload,
    where: searchIndex.versions
      ? combineQueries({ latest: { equals: true } }, appendVersionToQueryKey(where))
      : where,
  });

  return parseSearchFilter({ fields: searchIndex.fields, index: searchIndex.index, query });
}
