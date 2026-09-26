import type { MongooseAdapter } from '@payloadcms/db-mongodb';

export function isDraftSearch({
  adapter,
  collection,
  draft,
}: {
  adapter: MongooseAdapter;
  collection: string;
  draft: boolean;
}): boolean {
  return draft && Boolean(adapter.payload.collections[collection].config.versions?.drafts);
}
