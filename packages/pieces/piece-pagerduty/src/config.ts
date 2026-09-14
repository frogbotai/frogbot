import { z } from 'zod';

export const pagerdutyAuth = z.object({
  apiKey: z.string().min(1).meta({ label: 'API key', secret: true }),
});

export const pagerdutyOptions = z.object({
  signingSecret: z
    .string()
    .min(1)
    .meta({ label: 'Webhook signing secret', secret: true })
    .optional(),
});

export type PagerdutyOptions = z.output<typeof pagerdutyOptions>;
