import type { CollectionConfig } from 'frogbot';

/** The e2e spec rewrites this file to add a field. */
export const noteFields: NonNullable<CollectionConfig['fields']> = [
  { name: 'title', type: 'text' },
];
