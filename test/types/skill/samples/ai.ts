import type { CollectionConfig, FrogBotConfig, FrogBotInstance, FrogBotRequest } from 'frogbot';
import { buildConfig, getFrogBot, resolvePolicy } from 'frogbot';

import { domainConfig } from './domain-context.js';

export const ai = {
  defaultModel: 'zen/big-pickle',
  providers: {
    zen: {
      type: 'openai-compatible',
      baseUrl: 'https://opencode.ai/zen/v1',
      apiKey: 'public',
      models: [{ id: 'big-pickle', mode: 'chat' }],
    },
  },
} satisfies FrogBotConfig['ai'];

const config = buildConfig({ ...domainConfig, ai });

export async function generateUpdate() {
  const frogbot = await getFrogBot({ config });
  const result = await frogbot.generateText({
    model: 'zen/big-pickle',
    prompt: 'Write a one-sentence project update.',
  });

  console.log(result.text);

  return result;
}

export async function streamReleasePlan(frogbot: FrogBotInstance) {
  const result = await frogbot.streamText({
    model: 'zen/big-pickle',
    prompt: 'Explain the release plan.',
  });

  for await (const text of result.textStream) {
    process.stdout.write(text);
  }

  return result;
}

export async function embedProjectNotes() {
  const config = buildConfig({
    ...domainConfig,
    ai: {
      ...ai,
      providers: {
        ...ai.providers,
        openai: { apiKey: process.env.OPENAI_API_KEY },
      },
    },
  });

  const frogbot = await getFrogBot({ config });
  const embedding = await frogbot.embed({
    model: 'openai/text-embedding-3-small',
    value: 'FrogBot project notes',
  });

  return embedding;
}

export const PolicyUsers: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'modelAccess',
      type: 'radio',
      options: ['all', 'selected'],
      defaultValue: 'selected',
      access: { create: () => false, update: () => false },
    },
    {
      name: 'models',
      type: 'select',
      hasMany: true,
      options: ['zen/big-pickle'],
      defaultValue: ['zen/big-pickle'],
      access: { create: () => false, update: () => false },
    },
    {
      name: 'monthlyBudget',
      type: 'number',
      defaultValue: 10,
      access: { create: () => false, update: () => false },
    },
    {
      name: 'spendThisPeriodUSD',
      type: 'number',
      access: { create: () => false, update: () => false },
    },
  ],
};

export const policyConfig = buildConfig({
  ...domainConfig,
  collections: [PolicyUsers],
  ai,
});

export async function generatePolicyUpdate(req: FrogBotRequest) {
  const policy = resolvePolicy(req.user);
  const result = await req.frogbot.generateText({
    model: 'zen/big-pickle',
    prompt: 'Write a one-sentence project update.',
    req,
    overrideAccess: false,
  });

  return { policy, text: result.text };
}
