import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: openAccess,
  fields: [],
};

const Conversations: CollectionConfig = {
  slug: 'conversations',
  chat: true,
  fields: [],
} as never;

const Turns: CollectionConfig = {
  slug: 'turns',
  message: true,
  fields: [],
} as never;

export default await buildTestConfig({
  collections: [Users, Conversations, Turns],
});
