import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import { agentSlug, chatsSlug, modelPort, usersSlug } from '../shared.js';

export const allowedModel = 'test/thinker';
export const blockedModel = 'test/writer';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

export default await buildTestConfig({
  collections: [Users, { slug: chatsSlug, chat: true, fields: [] }],
  ai: {
    defaultModel: allowedModel,
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [
          { id: 'thinker', mode: 'chat' },
          { id: 'writer', mode: 'chat' },
        ],
      },
    },
    access: { generate: ({ req, model }) => Boolean(req.user) && model !== blockedModel },
  },
  agents: [
    {
      slug: agentSlug,
      model: { default: allowedModel, options: [blockedModel] },
      instructions: 'Help the user.',
      access: () => true,
    },
  ],
});
