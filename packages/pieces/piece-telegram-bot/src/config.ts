import { z } from 'zod';

export const telegramBotAuth = z.object({
  botToken: z.string().min(1).meta({ label: 'Bot token', secret: true }),
});

export type TelegramBotAuth = z.output<typeof telegramBotAuth>;
