import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { postsSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'textarea' },
    { name: 'priority', type: 'number' },
    { name: 'published', type: 'checkbox', defaultValue: false },
    { name: 'status', type: 'select', options: ['draft', 'published'], defaultValue: 'draft' },
  ],
};

export default await buildTestConfig({ collections: [Users, Posts] });
