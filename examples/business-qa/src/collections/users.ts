import type { CollectionConfig } from 'frogbot';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { useAsTitle: 'email' },
  fields: [{ name: 'name', type: 'text', required: true }],
};
