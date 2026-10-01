import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};
