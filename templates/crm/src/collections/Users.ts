import type { CollectionConfig } from 'frogbot';

import { firstUserIsAdmin, userAccess } from '../roles';

export const Users: CollectionConfig = {
  slug: 'users',
  access: userAccess,
  admin: { icon: 'people', group: false, useAsTitle: 'email' },
  auth: true,
  hooks: { beforeChange: [firstUserIsAdmin] },
  fields: [{ name: 'name', type: 'text' }],
};
