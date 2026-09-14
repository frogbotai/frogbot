import { z } from 'zod';

export const frontAuth = z.object({
  apiToken: z.string().min(1).meta({ label: 'API token', secret: true }),
});

export const frontOptions = z.object({});
