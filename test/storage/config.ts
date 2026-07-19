import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { mediaSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Media: CollectionConfig = {
  slug: mediaSlug,
  upload: {
    staticDir: '/tmp/frogbot-storage-int',
  },
  access: openAccess,
  fields: [{ name: 'alt', type: 'text' }],
};

export default await buildTestConfig({ collections: [Users, Media] });
