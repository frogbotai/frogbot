import type { AgentConfig, FrogBotConfig, SkillConfig } from 'frogbot';
import { buildConfig, getFrogBot } from 'frogbot';
import { general } from 'frogbot/agents';

import { ai } from './ai.js';
import { domainConfig } from './domain-context.js';

export const assistant: AgentConfig = {
  slug: 'assistant',
  model: {
    default: 'zen/big-pickle',
    options: ['zen/big-pickle'],
  },
  instructions: 'You are a concise and friendly assistant.',
};

export const agents: FrogBotConfig['agents'] = [general(), assistant];

const config = buildConfig({ ...domainConfig, ai, agents });

export async function runAgent() {
  const frogbot = await getFrogBot({ config });
  const result = await frogbot.agents.assistant.generate({
    prompt: "Summarize today's open tasks.",
    overrideAccess: true,
  });

  frogbot.logger.info(result.text);

  return result;
}

const supportPolicy: SkillConfig = {
  slug: 'support-policy',
  description: 'Customer support policy',
  instructions: 'Apply the support policy before proposing a resolution.',
  resources: [
    {
      path: 'refunds.md',
      description: 'Refund rules',
      content: 'Refunds require an order number and a verified customer email.',
    },
  ],
};

export const skillAssistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'Help customers resolve support requests.',
  skills: [supportPolicy],
};

export const freshRules: AgentConfig = {
  slug: 'rules',
  instructions: ({ req }) => `Help ${req.user ? 'the signed-in user' : 'the visitor'}.`,
};

export const asyncRules: AgentConfig = {
  slug: 'async-rules',
  instructions: async ({ req }) => {
    const { docs } = await req.frogbot.find({ collection: 'policies', limit: 1, req });

    return `Follow this policy: ${String(docs[0]?.body ?? 'none')}`;
  },
};
