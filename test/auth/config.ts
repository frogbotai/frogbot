import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [
    { name: 'name', type: 'text' },
    { name: 'role', type: 'select', options: ['admin', 'member'], defaultValue: 'member' },
  ],
};

export default await buildTestConfig({ collections: [Users] });
