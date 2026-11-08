import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  admin: { icon: 'people', group: false, useAsTitle: 'email' },
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};
