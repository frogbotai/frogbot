import type { CollectionConfig } from 'frogbot';

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    icon: 'image',
    views: [{ type: 'list' }, { type: 'gallery', label: 'Grid' }],
  },
  file: true,
  fields: [{ name: 'alt', type: 'text' }],
};
