import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

const Accounts: CollectionConfig = {
  slug: 'accounts',
  auth: true,
  access: openAccess,
  fields: [],
};

const Posts: CollectionConfig = {
  slug: 'posts',
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'optional', type: 'text' },
  ],
};

export default await buildTestConfig({
  collections: [Accounts, Posts],
  plugins: [
    apiKeysPlugin({
      authCollection: 'accounts',
      collectionSlug: 'credentials',
      tokenPrefix: 'test',
      headerNames: ['x-service-key'],
    }),
    auditLogPlugin({ collections: ['posts'], retention: { days: 30 } }),
  ],
});
