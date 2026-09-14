import { z } from 'zod';

export const stripeAuth = z.object({
  apiKey: z.string().min(1).meta({ label: 'Secret API Key', secret: true }),
});
