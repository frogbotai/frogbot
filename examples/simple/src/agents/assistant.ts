import type { AgentConfig, Tool } from 'frogbot';
import { z } from 'zod';

const getTimeSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe('An IANA timezone, e.g. "America/Los_Angeles". Defaults to UTC.'),
});

const getTime: Tool<typeof getTimeSchema> = {
  slug: 'get_time',
  description:
    'Get the current date and time, optionally in a specific IANA timezone.',
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
  instructions:
    'You are FrogBot, a concise and friendly assistant. ' +
    'Use the get_time tool whenever the user asks about the current date or time.',
  tools: [getTime],
  access: () => true,
};
