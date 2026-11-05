import type { CollectionConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import { agentSlug, chatsSlug, modelPort, usersSlug } from '../shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

export default await buildTestConfig({
  collections: [Users, { slug: chatsSlug, chat: true, fields: [] }],
  ai: {
    defaultModel: 'test/small-window',
    compaction: { auto: false, keep: 200 },
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [{ id: 'small-window', mode: 'chat', limit: { context: 4_000 } }],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'test/small-window',
      instructions: 'Help the user.',
      access: () => true,
      tools: [...todoTools],
    },
  ],
});
