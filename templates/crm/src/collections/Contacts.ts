import type { CollectionConfig } from 'frogbot';
import { phoneField } from 'frogbot';

import { reassignAccess, recordAccess } from '../roles';

export const Contacts: CollectionConfig = {
  slug: 'contacts',
  access: recordAccess('owner'),
  admin: {
    icon: 'id-card',
    useAsTitle: 'name',
    views: [
      {
        type: 'list',
        defaultFields: [
          'name',
          'jobTitle',
          'company',
          'email',
          'owner',
          'lastContacted',
        ],
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'jobTitle', type: 'text' },
    { name: 'company', type: 'relationship', relationTo: 'companies' },
    { name: 'email', type: 'email' },
    phoneField({ name: 'phone' }),
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      access: reassignAccess,
    },
    {
      name: 'lastContacted',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'MMM d, yyyy' },
      },
    },
  ],
};
