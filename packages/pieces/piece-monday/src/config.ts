import { z } from 'zod';

export const mondayAuth = z.object({
  apiToken: z.string().min(1).meta({ label: 'API v2 Token', secret: true }),
});
