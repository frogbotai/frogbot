import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: openAccess,
  fields: [],
};

export default await buildTestConfig({
  collections: [Users],
  ai: {
    providers: {
      zen: {
        type: 'openai-compatible',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: 'public',
        models: [{ id: 'deepseek-v4-flash-free', mode: 'chat' }],
      },
    },
  },
});
