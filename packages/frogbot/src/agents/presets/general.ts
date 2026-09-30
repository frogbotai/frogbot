import type { AgentConfig } from '../types.js';

const instructions = 'You are a concise and helpful general assistant.';

export function general(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    model: { options: '*' },
    ...overrides,
    slug: 'general',
    instructions,
  };
}
