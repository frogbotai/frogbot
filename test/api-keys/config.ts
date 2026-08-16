import type { CollectionConfig, Plugin } from 'frogbot';

import { apiKeysPlugin } from '../../packages/plugins/plugin-api-keys/src/index.js';
import { rolesPlugin } from '../../packages/plugins/plugin-roles/src/index.js';
import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const addTenant: Plugin = (config) => ({
  ...config,
  collections: config.collections.map((collection) =>
    collection.slug === 'credentials'
      ? { ...collection, fields: [...collection.fields, { name: 'tenant', type: 'text' as const }] }
      : collection,
  ),
});

const Accounts: CollectionConfig = {
  slug: 'accounts',
  auth: true,
  access: openAccess,
  fields: [],
};

export default await buildTestConfig({
  collections: [Accounts],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:3988/v1',
        apiKey: 'test-key',
        models: [
          { id: 'allowed', mode: 'chat', cost: { input: 1, output: 2 } },
          { id: 'blocked', mode: 'chat', cost: { input: 1, output: 2 } },
        ],
      },
    },
  },
  plugins: [
    rolesPlugin(),
    apiKeysPlugin({
      authCollection: 'accounts',
      collectionSlug: 'credentials',
      tokenPrefix: 'test',
      headerNames: ['x-service-key'],
      collection: { fields: [{ name: 'environment', type: 'text' }] },
    }),
    addTenant,
  ],
});
