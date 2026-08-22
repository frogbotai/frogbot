import type { AgentConfig, Tool } from 'frogbot';
import { z } from 'zod';

const getTimeSchema = z.object({
  timezone: z.string().optional(),
});

const getTime: Tool<typeof getTimeSchema> = {
  slug: 'get_time',
  description: 'Get the current date and time in an IANA timezone.',
  inputSchema: getTimeSchema,
  execute: ({ timezone }) => {
    const now = new Date();
    const zone = timezone ?? 'UTC';
    return {
      iso: now.toISOString(),
      formatted: now.toLocaleString('en-US', { timeZone: zone }),
      timezone: zone,
    };
  },
};

export const assistant: AgentConfig = {
  slug: 'assistant',
  model: 'openai/gpt-4o-mini',
  instructions: 'Use the get_time tool for questions about the current time.',
  tools: [getTime],
  access: () => true,
};
