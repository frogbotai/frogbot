import { z } from 'zod';

export const trelloAuth = z.object({
  username: z.string().min(1).meta({ label: 'API key', secret: true }),
  password: z.string().min(1).meta({ label: 'Token', secret: true }),
  applicationSecret: z.string().min(1).meta({ label: 'Application secret', secret: true }),
});
