import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { FlattenedField } from 'payload';
import { buildVersionCollectionFields, getLocalizedPaths } from 'payload';

import type { SearchFieldType } from './types.js';

export function getSearchFields({
  adapter,
  collection,
  versions,
}: {
  adapter: MongooseAdapter;
  collection: string;
  versions: boolean;
}): FlattenedField[] {
  const { config } = adapter.payload.collections[collection];

  return versions
    ? buildVersionCollectionFields(adapter.payload.config, config, true)
    : config.flattenedFields;
}

export function getSearchLocales(adapter: MongooseAdapter): (string | undefined)[] {
  const { localization } = adapter.payload.config;

  return localization ? localization.localeCodes : [undefined];
}

export function getIDFieldType({
  adapter,
  collection,
}: {
  adapter: MongooseAdapter;
  collection: string;
}): SearchFieldType {
  const customIDType = adapter.payload.collections[collection]?.customIDType;

  if (customIDType === 'number') return 'number';

  return customIDType === 'text' ? 'token' : 'objectId';
}

export function getSearchPath({
  adapter,
  collection,
  fields,
  locale,
  path,
  versions,
}: {
  adapter: MongooseAdapter;
  collection: string;
  fields: FlattenedField[];
  locale: string | undefined;
  path: string;
  versions: boolean;
}): { field?: FlattenedField; path: string } {
  if (path === 'id') return { path: versions ? 'parent' : '_id' };

  const [resolved] = getLocalizedPaths({
    collectionSlug: collection,
    fields,
    incomingPath: versions ? `version.${path}` : path,
    locale,
    overrideAccess: true,
    payload: adapter.payload,
    showHiddenFields: true,
  });

  if (!resolved?.path || resolved.invalid) {
    throw new Error(`Search path '${path}' does not exist in collection '${collection}'.`);
  }

  return { field: resolved.field, path: resolved.path };
}
