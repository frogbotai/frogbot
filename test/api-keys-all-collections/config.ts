import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { mcpPlugin } from '@frogbotai/plugin-mcp';
import type { CollectionConfig, Plugin } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

const Users: CollectionConfig = { slug: 'users', auth: true, access: openAccess, fields: [] };

const addPosts: Plugin = (config) => ({
  ...config,
  collections: [
    ...config.collections,
    { slug: 'posts', access: { read: () => true }, fields: [{ name: 'title', type: 'text' }] },
  ],
});

const addPages: Plugin = Object.assign(
  (config: Parameters<Plugin>[0]) => ({
    ...config,
    collections: [
      ...config.collections,
      {
        slug: 'pages',
        access: { read: () => true },
        fields: [{ name: 'title', type: 'text' as const }],
      },
    ],
  }),
  { order: 200 },
);

export default await buildTestConfig({
  admin: { user: 'users' },
  collections: [Users, { slug: 'chats', chat: true, fields: [] }],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:9/v1',
        apiKey: 'test-key',
        models: [{ id: 'allowed', mode: 'chat', cost: { input: 1, output: 2 } }],
      },
    },
  },
  plugins: [apiKeysPlugin({ authCollection: 'users' }), mcpPlugin({}), addPosts, addPages],
});
