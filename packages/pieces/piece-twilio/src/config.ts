import { z } from 'zod';

export const twilioAuth = z.object({
  username: z.string().min(1).meta({ label: 'Account SID' }),
  password: z.string().min(1).meta({ label: 'Auth token', secret: true }),
});

export const twilioOptions = z.object({});
