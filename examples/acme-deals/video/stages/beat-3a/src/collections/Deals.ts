import type { CollectionConfig } from 'frogbot';

export const Deals: CollectionConfig = {
  slug: 'deals',
  fields: [
    { name: 'name', type: 'text', required: true },
  ],
};
