import type { CollectionConfig, Tool } from 'frogbot';
import { general } from 'frogbot/agents';
import { question, todoTools } from 'frogbot/tools';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  agentSlug,
  chatsSlug,
  lookupCalls,
  questionAgentSlug,
  unavailableTopic,
  usersSlug,
} from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const lookupInput = z.object({ topic: z.string() });

const lookup: Tool<typeof lookupInput, string> = {
  slug: 'lookup',
  description: 'Look up a topic.',
  inputSchema: lookupInput,
  execute: ({ topic }) => {
    lookupCalls.push(topic);

    if (topic === unavailableTopic) throw new Error(`No results for ${topic}.`);

    return `Found ${topic}.`;
  },
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

const generalAgent = general({ tools: [...todoTools] });

export const generalAgentSlug = generalAgent.slug;
export const wildcardAgentSlug = 'wildcard';

export default await buildTestConfig({
  collections: [Users, Chats],
  ai: {
    defaultModel: 'test/gpt-4.1-mini',
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:3988/v1',
        apiKey: 'test-key',
        models: [
          { id: 'gpt-4.1-mini', mode: 'chat' },
          {
            id: 'thinker',
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
          },
          { id: 'writer', mode: 'chat', reasoningOptions: [{ type: 'effort', values: ['max'] }] },
        ],
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
    {
      slug: questionAgentSlug,
      model: { default: 'test/gpt-4.1-mini', options: ['test/thinker', 'test/writer'] },
      instructions: 'Ask before acting.',
      access: () => true,
      tools: [question, lookup],
    },
    {
      slug: wildcardAgentSlug,
      model: { default: 'test/gpt-4.1-mini', options: '*' },
      instructions: 'Help the user.',
      access: () => true,
      tools: [...todoTools],
    },
    generalAgent,
  ],
});
