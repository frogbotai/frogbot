import { z } from 'zod';

export const attioAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
});
