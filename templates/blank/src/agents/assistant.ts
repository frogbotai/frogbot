import type { AgentConfig } from 'frogbot';

export const assistant: AgentConfig = {
  slug: 'assistant',
  model: 'zen/deepseek-v4-flash-free',
  instructions: 'You are a concise and friendly assistant.',
  access: () => true,
};
