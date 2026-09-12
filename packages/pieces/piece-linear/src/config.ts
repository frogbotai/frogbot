import { z } from 'zod';

export const linearAuth = z.object({
  apiKey: z.string().min(1).meta({ label: 'API key', secret: true }),
});
export const teamId = z.string().meta({ label: 'Team' });
