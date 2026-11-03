import {
  type CollectionConfig as PayloadCollectionConfig,
  flattenAllFields,
  getFieldByPath,
} from 'payload';

import type { AutonumberScope } from '../../../config/sanitized.js';

type CompoundIndex = NonNullable<PayloadCollectionConfig['indexes']>[number];

export type ScopedAutonumber = { path: string; scope: AutonumberScope };

export function scopedAutonumberIndexes({
  collection,
  entries,
}: {
  collection: PayloadCollectionConfig;
  entries: ScopedAutonumber[];
}): CompoundIndex[] {
  if (!entries.length) return [];

  const fields = flattenAllFields({ fields: collection.fields });

  return entries.map(({ path, scope }) => {
    const found = getFieldByPath({ fields, path: scope.path });
    const field = found?.field;

    if (
      field?.type !== 'relationship' ||
      !field.required ||
      found!.pathHasLocalized ||
      field.hasMany ||
      typeof field.relationTo !== 'string'
    ) {
      throw new Error(
        `[frogbot] Autonumber field '${path}' in collection '${collection.slug}' has scope '${scope.name}', which must be a required relationship to one collection, not localized or hasMany.`,
      );
    }

    return { fields: [scope.path, path], unique: true };
  });
}
