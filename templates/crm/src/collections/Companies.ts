import type { CollectionConfig } from 'frogbot';
import { urlField } from 'frogbot';

import { reassignAccess, recordAccess } from '../roles';

export const Companies: CollectionConfig = {
  slug: 'companies',
  access: recordAccess('owner'),
  admin: {
    icon: 'building',
    useAsThumbnail: 'logo',
    useAsTitle: 'name',
    views: [
      {
        type: 'list',
        defaultFields: [
          'name',
          'lifecycle',
          'industry',
          'employees',
          'owner',
          'website',
        ],
      },
      {
        type: 'gallery',
        label: 'Logos',
        thumbnailFit: 'contain',
        defaultFields: ['industry', 'owner'],
      },
      {
        type: 'board',
        groupBy: 'lifecycle',
        useAsThumbnail: false,
        defaultFields: ['name', 'industry', 'employees'],
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    {
      name: 'lifecycle',
      type: 'select',
      defaultValue: 'lead',
      options: [
        { label: 'Lead', value: 'lead', color: 'gray' },
        { label: 'Prospect', value: 'prospect', color: 'blue' },
        { label: 'Customer', value: 'customer', color: 'green' },
        { label: 'Churned', value: 'churned', color: 'red' },
      ],
    },
    {
      name: 'industry',
      type: 'select',
      options: [
        { label: 'Software', value: 'software', color: 'blue' },
        { label: 'Finance', value: 'finance', color: 'green' },
        { label: 'Healthcare', value: 'healthcare', color: 'pink' },
        { label: 'Retail', value: 'retail', color: 'yellow' },
        { label: 'Manufacturing', value: 'manufacturing', color: 'gray' },
        { label: 'Education', value: 'education', color: 'purple' },
      ],
    },
    urlField({ name: 'website' }),
    { name: 'employees', type: 'number', min: 1 },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      access: reassignAccess,
    },
    { name: 'notes', type: 'richText' },
  ],
};
