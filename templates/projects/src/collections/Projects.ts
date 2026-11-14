import type { CollectionConfig } from 'frogbot';

import { managedAccess } from '../roles';

export const Projects: CollectionConfig = {
  slug: 'projects',
  access: managedAccess,
  admin: { icon: 'briefcase', useAsTitle: 'name' },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Short prefix for task keys, such as WEB in WEB-12.',
      },
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Planned', value: 'planned' },
        { label: 'Active', value: 'active' },
        { label: 'Done', value: 'done' },
      ],
    },
  ],
};
