import type { CollectionConfig, Tool, Where } from 'frogbot';
import { general } from 'frogbot/agents';
import { question, todoTools } from 'frogbot/tools';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  agentSlug,
  chatsSlug,
  lookupCalls,
  modelPort,
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

      const ownOrShared: Where = {
        or: [{ user: { equals: req.user.id } }, { sharedWith: { contains: req.user.id } }],
      };

      return ownOrShared;
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
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [
          { id: 'gpt-4.1-mini', mode: 'chat' },
          {
            id: 'thinker',
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
          },
          { id: 'writer', mode: 'chat', reasoningOptions: [{ type: 'effort', values: ['max'] }] },
          { id: 'reasoner', mode: 'chat', reasoning: true },
          { id: 'text-only', mode: 'chat', modalities: { input: ['text'], output: ['text'] } },
          {
            id: 'media',
            mode: 'chat',
            modalities: { input: ['text', 'image', 'audio', 'video', 'pdf'], output: ['text'] },
          },
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
      model: {
        default: 'test/gpt-4.1-mini',
        options: ['test/thinker', 'test/writer', 'test/reasoner', 'test/text-only', 'test/media'],
      },
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
