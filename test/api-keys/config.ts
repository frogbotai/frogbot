import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import type { FrogbotConfig, Plugin } from 'frogbot';

import { rolesPlugin } from '../../packages/plugins/plugin-roles/src/index.js';

export const addTenant: Plugin = (config) => ({
  ...config,
  collections: config.collections.map((collection) =>
    collection.slug === 'credentials'
      ? { ...collection, fields: [...collection.fields, { name: 'tenant', type: 'text' as const }] }
      : collection,
  ),
});

export const config: FrogbotConfig = {
  secret: 'api-keys-test',
  db: {} as FrogbotConfig['db'],
  collections: [{ slug: 'accounts', auth: true, fields: [] }],
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
};
