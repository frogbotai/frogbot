import type { CollectionConfig } from 'frogbot';

import { sharedAccess } from '../roles';

export const Media: CollectionConfig = {
  slug: 'media',
  access: sharedAccess,
  admin: {
    icon: 'image',
    views: [{ type: 'list' }, { type: 'gallery', label: 'Grid' }],
  },
  file: true,
  fields: [{ name: 'alt', type: 'text' }],
};
