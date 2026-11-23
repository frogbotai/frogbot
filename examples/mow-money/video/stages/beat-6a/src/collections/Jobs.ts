import type { CollectionConfig } from 'frogbot';

export const Jobs: CollectionConfig = {
  slug: 'lawn-jobs',
  fields: [
    { name: 'customer', type: 'text', required: true },
  ],
};
