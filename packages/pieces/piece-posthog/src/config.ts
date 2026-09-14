import { z } from 'zod';

export const posthogAuth = z.object({
  personalApiKey: z.string().min(1).meta({ label: 'Personal API key', secret: true }),
});
