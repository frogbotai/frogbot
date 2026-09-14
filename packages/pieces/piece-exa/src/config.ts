import { z } from 'zod';

export const exaAuth = z.object({
  apiKey: z.string().min(1).meta({ label: 'API key', secret: true }),
});
