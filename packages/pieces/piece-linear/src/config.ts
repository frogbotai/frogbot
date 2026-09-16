import { z } from 'zod';

const linearApiKeyAuth = z.object({
  apiKey: z.string().min(1).meta({ label: 'API key', secret: true }),
});

const linearAccessTokenAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'OAuth access token', secret: true }),
});

export const linearAuth = linearApiKeyAuth
  .extend(linearAccessTokenAuth.shape)
  .partial()
  .pipe(z.union([linearApiKeyAuth, linearAccessTokenAuth]));

export const linearOptions = z.object({
  webhookSecret: z
    .string()
    .min(1)
    .meta({ label: 'Webhook signing secret', secret: true })
    .optional(),
  channelMode: z
    .enum(['agent-sessions', 'comments'])
    .default('agent-sessions')
    .meta({ label: 'Channel mode' }),
  botUsername: z.string().min(1).optional().meta({ label: 'Bot username' }),
});
export type LinearOptions = z.output<typeof linearOptions>;

export const teamId = z.string().meta({ label: 'Team' });
