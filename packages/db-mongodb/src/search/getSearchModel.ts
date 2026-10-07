import type { MongooseAdapter } from '@payloadcms/db-mongodb';

export type SearchModel = MongooseAdapter['collections'][string];

export function getSearchModel({
  adapter,
  collection,
  versions,
}: {
  adapter: MongooseAdapter;
  collection: string;
  versions: boolean;
}): SearchModel {
  return versions ? adapter.versions[collection] : adapter.collections[collection];
}
