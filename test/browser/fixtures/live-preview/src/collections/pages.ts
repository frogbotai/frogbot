import type { CollectionConfig } from 'frogbot';

import { pagesSlug } from '../shared';

export const Pages: CollectionConfig = {
  slug: pagesSlug,
  access: { read: ({ req }) => Boolean(req.user) },
  versions: { drafts: true },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true },
  ],
};
