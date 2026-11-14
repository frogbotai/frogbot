import type { CollectionConfig } from 'frogbot';
import { moneyField } from 'frogbot';

import { reassignAccess, recordAccess } from '../roles';

export const Deals: CollectionConfig = {
  slug: 'deals',
  access: recordAccess('owner'),
  admin: {
    icon: 'hand-coins',
    useAsTitle: 'name',
    views: [
      {
        type: 'list',
        defaultFields: [
          'name',
          'company',
          'stage',
          'amount',
          'closeDate',
          'owner',
        ],
        editable: true,
        groupBy: 'stage',
        summary: { name: 'count', amount: 'sum' },
      },
      {
        type: 'board',
        groupBy: 'stage',
        defaultFields: ['name', 'company', 'amount', 'closeDate'],
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'company', type: 'relationship', relationTo: 'companies' },
    { name: 'contact', type: 'relationship', relationTo: 'contacts' },
    {
      name: 'stage',
      type: 'select',
      defaultValue: 'lead',
      options: [
        { label: 'Lead', value: 'lead', color: 'gray' },
        { label: 'Qualified', value: 'qualified', color: 'blue' },
        { label: 'Proposal', value: 'proposal', color: 'purple' },
        { label: 'Negotiation', value: 'negotiation', color: 'yellow' },
        { label: 'Won', value: 'won', color: 'green' },
        { label: 'Lost', value: 'lost', color: 'red' },
      ],
    },
    moneyField({ name: 'amount', currency: 'USD' }),
    {
      name: 'closeDate',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'MMM d, yyyy' },
      },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      access: reassignAccess,
    },
    { name: 'notes', type: 'richText' },
  ],
};
