import type { CollectionConfig } from 'frogbot';

import { aiLimitAccess, firstUserIsAdmin, userAccess } from '../roles';

export const Users: CollectionConfig = {
  slug: 'users',
  access: userAccess,
  admin: { icon: 'people', group: false, useAsTitle: 'name' },
  auth: true,
  hooks: { beforeChange: [firstUserIsAdmin] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'monthlyBudget', type: 'number', access: aiLimitAccess },
    {
      name: 'models',
      type: 'select',
      hasMany: true,
      options: [],
      access: aiLimitAccess,
    },
  ],
};
