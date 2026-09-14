import { z } from 'zod';

export const resendAuth = z.object({ apiKey: z.string() });
export const resendOptions = z.object({
  from: z.object({ address: z.string(), name: z.string().optional() }).optional(),
});
