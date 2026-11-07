import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { icon: 'people', useAsTitle: 'name' },
  fields: [{ name: 'name', type: 'text' }],
};
