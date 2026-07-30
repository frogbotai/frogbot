import type { AgentConfig } from 'frogbot';

export const assistant: AgentConfig = {
  slug: 'assistant',
  model: 'assistant',
  instructions: 'You are a concise and friendly assistant.',
  access: () => true,
};
