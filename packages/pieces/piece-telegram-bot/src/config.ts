import { z } from 'zod';

export const telegramBotAuth = z.object({
  botToken: z.string().min(1).meta({ label: 'Bot token', secret: true }),
});

export const telegramBotOptions = z.object({
  webhookSecret: z
    .string()
    .min(1)
    .max(256)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'Webhook secret may contain letters, numbers, underscores, and hyphens.',
    )
    .optional()
    .meta({ label: 'Webhook secret', secret: true }),
  botUsername: z.string().min(1).optional().meta({ label: 'Bot username' }),
  allowedUserIds: z.array(z.string().min(1)).optional().meta({ label: 'Allowed user IDs' }),
});

export type TelegramBotAuth = z.output<typeof telegramBotAuth>;
