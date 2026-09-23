import type { CollectionConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { agentSlug, chatsSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Chats: CollectionConfig = {
  slug: chatsSlug,
  chat: true,
  access: {
    read: ({ req }) => {
      if (!req.user) return false;

      return {
        or: [{ user: { equals: req.user.id } }, { sharedWith: { contains: req.user.id } }],
      };
    },
  },
  fields: [{ name: 'sharedWith', type: 'relationship', relationTo: usersSlug, hasMany: true }],
};

export default await buildTestConfig({
  collections: [Users, Chats],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:3988/v1',
        apiKey: 'test-key',
        models: [{ id: 'gpt-4.1-mini', mode: 'chat' }],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'test/gpt-4.1-mini',
      instructions: 'Help the user.',
      access: () => true,
      tools: [...todoTools],
    },
  ],
});
