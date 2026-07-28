import type { CollectionConfig } from 'frogbot';

export const Connections: CollectionConfig = {
  slug: 'connections',
  connections: true,
  admin: { group: 'Integrations' },
  fields: [
    {
      name: 'environment',
      type: 'select',
      options: ['development', 'staging', 'production'],
    },
    { name: 'notes', type: 'textarea' },
  ],
};
