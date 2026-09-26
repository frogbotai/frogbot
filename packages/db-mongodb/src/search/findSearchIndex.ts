import type { SearchModel } from './getSearchModel.js';

export type SearchIndexInfo = {
  latestDefinition?: unknown;
  name: string;
  queryable?: boolean;
  status?: string;
  type?: string;
};

export async function findSearchIndex({
  Model,
  name,
}: {
  Model: SearchModel;
  name: string;
}): Promise<SearchIndexInfo | undefined> {
  const [index] = (await Model.collection.listSearchIndexes(name).toArray()) as SearchIndexInfo[];

  return index?.status === 'DOES_NOT_EXIST' ? undefined : index;
}
