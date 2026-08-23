import type { AgentConfig } from '../../types/agent.js';

const instructions = 'You are a concise and helpful general assistant.';

export function general(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    ...overrides,
    slug: 'general',
    instructions,
  };
}
