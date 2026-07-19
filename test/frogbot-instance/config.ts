import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { postsSlug, usersSlug } from './shared.js';

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  versions: { drafts: true, maxPerDoc: 10 },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'text' },
    { name: 'status', type: 'select', options: ['draft', 'published'] },
  ],
};

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

export default await buildTestConfig({ collections: [Posts, Users] });
