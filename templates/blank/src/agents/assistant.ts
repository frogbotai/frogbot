import type { AgentConfig } from 'frogbot';

export const assistant: AgentConfig = {
  slug: 'assistant',
  model: process.env.FROGBOT_MODEL ?? 'openai/gpt-4o-mini',
  instructions: 'You are a concise and friendly assistant.',
  access: () => true,
};
