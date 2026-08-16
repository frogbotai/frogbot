import type { CollectionConfig } from 'frogbot';

import { allow, rolesPlugin } from '../../packages/plugins/plugin-roles/src/index.js';
import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: openAccess,
  fields: [],
};

const MemberDocuments: CollectionConfig = {
  slug: 'member-documents',
  access: {
    create: () => false,
    read: allow('member'),
    update: () => false,
    delete: () => false,
  },
  fields: [{ name: 'title', type: 'text', required: true }],
};

export default await buildTestConfig({
  collections: [Users, MemberDocuments],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:3988/v1',
        apiKey: 'test-key',
        models: [{ id: 'test-model', mode: 'chat' }],
      },
    },
  },
  agents: [{ slug: 'roles-test', model: 'test/test-model', instructions: 'Test agent.' }],
  plugins: [
    rolesPlugin({
      roles: ['admin', 'member', 'owner'],
      rolesFieldAccess: { update: allow('owner') },
    }),
  ],
});
