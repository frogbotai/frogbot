import type { AgentConfig, Tool } from 'frogbot';
import { z } from 'zod';

const inputSchema = z.object({});

const getSecretCode: Tool<typeof inputSchema, { code: string }> = {
  slug: 'get_secret_code',
  description: 'Returns the secret verification code. Always call this before answering.',
  inputSchema,
  execute: () => ({ code: 'FROGBOT-E2E-7421' }),
};

export const toolDemo: AgentConfig = {
  slug: 'tool-demo',
  model: process.env.E2E_ZEN_MODEL ?? 'zen/deepseek-v4-flash-free',
  instructions: 'Call the available tool when asked for the secret code, then report its exact result.',
  tools: [getSecretCode],
};
