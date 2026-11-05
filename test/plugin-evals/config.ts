import { checks, evalsPlugin, judge } from '@frogbotai/plugin-evals';
import type { CollectionConfig, FrogBotConfig, Plugin } from 'frogbot';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  agentModel,
  agentSlug,
  deniedEmail,
  failNextWrite,
  modelPort,
  offListModel,
  otherModel,
  usersSlug,
} from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

const failResultWrites: Plugin = Object.assign(
  (config: FrogBotConfig): FrogBotConfig => ({
    ...config,
    collections: config.collections.map((collection) =>
      collection.slug === 'eval-results'
        ? {
            ...collection,
            hooks: {
              beforeChange: [
                ({ data }) => {
                  const input = (data.caseSnapshot as { input?: string } | undefined)?.input;

                  if (input && failNextWrite.delete(input)) throw new Error('disk full');

                  return data;
                },
              ],
            },
          }
        : collection,
    ),
  }),
  { order: 300 },
);

export default buildTestConfig({
  admin: { user: usersSlug },
  collections: [Users],
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [
          { id: 'agent', mode: 'chat' },
          { id: 'other', mode: 'chat' },
          { id: 'judge', mode: 'chat' },
        ],
      },
    },
    access: {
      generate: ({ req }) => (req.user as { email?: string } | null)?.email !== deniedEmail,
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: { default: agentModel as never, options: [agentModel, otherModel] as never },
      instructions: 'Answer billing questions.',
      tools: [
        {
          slug: 'findInvoices',
          description: 'Find invoices',
          inputSchema: z.object({ customer: z.string() }),
          execute: () => ({ total: 42 }),
        },
      ],
    },
  ],
  plugins: [
    evalsPlugin({
      scorers: {
        usedLookup: checks.calledTool('findInvoices'),
        mentions42: checks.includes('42'),
        grounded: judge({
          rubric: 'Score 1 if the answer is backed by tools.',
          model: offListModel as never,
        }),
      },
      concurrency: 1,
    }),
    failResultWrites,
  ],
});
