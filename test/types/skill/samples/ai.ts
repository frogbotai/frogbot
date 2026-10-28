import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import type { CollectionConfig, FrogBotConfig, FrogBotInstance } from 'frogbot';
import { buildConfig, getFrogBot } from 'frogbot';

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

  frogbot.logger.info(result.text);

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

class OutOfCreditsError extends Error {
  status = 402;
  code = 'insufficient_credits';
}

export const creditsAI = {
  defaultModel: 'openai/gpt-5.4-mini',
  providers: { openai: true },
  access: {
    generate: ({ req, model }) => {
      if (!req.user) return false;
      if (typeof req.user.credits !== 'number' || req.user.credits <= 0) {
        throw new OutOfCreditsError('You have no credits left.');
      }

      return model !== 'openai/gpt-5.4';
    },
  },
} satisfies FrogBotConfig['ai'];

export const PolicyUsers: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'monthlyBudget',
      type: 'number',
      defaultValue: 10,
      access: { update: ({ req }) => req.user?.role === 'admin' },
    },
  ],
};

export const plugins = [aiPolicyPlugin()];

export const policyConfig = buildConfig({
  ...domainConfig,
  collections: [PolicyUsers],
  ai,
  plugins,
});
