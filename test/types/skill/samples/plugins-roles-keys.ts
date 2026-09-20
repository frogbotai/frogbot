import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { allow, hasRole, rolesPlugin } from '@frogbotai/plugin-roles';
import type { CollectionConfig, FrogbotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

import { domainConfig } from './domain-context.js';

export const plugins: FrogbotConfig['plugins'] = [
  apiKeysPlugin(),
  rolesPlugin({ roles: ['admin', 'member'] }),
];

export const pluginConfig = buildConfig({ ...domainConfig, plugins });

export const roles = rolesPlugin({
  roles: ['admin', 'member', { slug: 'finance', label: 'Finance' }],
  defaultRole: 'member',
});

export const access: NonNullable<CollectionConfig['access']> = {
  read: allow('admin', { role: 'member', own: 'owner' }),
  update: ({ req }) => hasRole(req, 'admin', 'finance'),
};

export const rolesConfig = buildConfig({
  ...domainConfig,
  collections: [
    ...domainConfig.collections,
    {
      slug: 'reports',
      access,
      fields: [{ name: 'owner', type: 'relationship', relationTo: 'users' }],
    },
  ],
  plugins: [roles],
});

export const customApiKeys = apiKeysPlugin({
  authCollection: 'accounts',
  collectionSlug: 'credentials',
  tokenPrefix: 'acme',
  headerNames: ['x-service-key'],
  collection: {
    admin: { group: 'Security' },
  },
});

export const apiKeysConfig = buildConfig({
  ...domainConfig,
  admin: { user: 'accounts' },
  collections: [{ slug: 'accounts', auth: true, fields: [] }],
  plugins: [customApiKeys],
});
