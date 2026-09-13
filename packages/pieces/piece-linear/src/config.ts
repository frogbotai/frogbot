import { z } from 'zod';

export const linearAuth = z.object({
  apiKey: z.string().min(1).meta({ label: 'API key', secret: true }),
});
export const linearOptions = z.object({
  webhookSecret: z
    .string()
    .min(1)
    .meta({ label: 'Webhook signing secret', secret: true })
    .optional(),
});
export type LinearOptions = z.output<typeof linearOptions>;

export const teamId = z.string().meta({ label: 'Team' });
