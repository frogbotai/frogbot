import type { CollectionConfig } from 'frogbot';
import { moneyField } from 'frogbot';

export const Jobs: CollectionConfig = {
  slug: 'lawn-jobs',
  admin: {
    useAsTitle: 'customer',
    views: [
      { type: 'list', defaultFields: ['customer', 'stage', 'price'] },
      { type: 'board', groupBy: 'stage', defaultFields: ['customer', 'price'] },
    ],
  },
  fields: [
    { name: 'customer', type: 'text', required: true },
    moneyField({ name: 'price', currency: 'USD' }),
    {
      name: 'stage',
      type: 'select',
      defaultValue: 'quoted',
      options: [
        { label: 'Quoted', value: 'quoted', color: 'gray' },
        { label: 'Scheduled', value: 'scheduled', color: 'blue' },
        { label: 'Mowed', value: 'mowed', color: 'green' },
        { label: 'Paid', value: 'paid', color: 'purple' },
      ],
    },
  ],
};
