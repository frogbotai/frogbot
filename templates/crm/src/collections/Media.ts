import type { CollectionConfig } from 'frogbot';

export const Media: CollectionConfig = {
  slug: 'media',
  admin: { icon: 'image' },
  file: true,
  fields: [{ name: 'alt', type: 'text' }],
};
