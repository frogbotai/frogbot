import type { CollectionConfig } from 'frogbot';

export const Deals: CollectionConfig = {
  slug: 'deals',
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'stage',
      type: 'select',
      defaultValue: 'lead',
      options: [
        { label: 'Lead', value: 'lead', color: 'gray' },
        { label: 'Proposal', value: 'proposal', color: 'purple' },
        { label: 'Won', value: 'won', color: 'green' },
        { label: 'Lost', value: 'lost', color: 'red' },
      ],
    },
  ],
};
