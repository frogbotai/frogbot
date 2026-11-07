import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  admin: { settings: true },
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};
