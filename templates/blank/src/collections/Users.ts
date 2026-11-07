import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  admin: { group: false },
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};
