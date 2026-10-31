import { z } from 'zod';

export const openaiAuth = z.object({
  apiKey: z.string().trim().startsWith('sk-').meta({ secret: true, title: 'API key' }),
});

export type OpenAIAuth = z.output<typeof openaiAuth>;
