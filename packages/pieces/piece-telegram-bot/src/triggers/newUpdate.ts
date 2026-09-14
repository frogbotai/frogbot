import { createHash } from 'node:crypto';

import type { PieceJSON, PieceWebhookTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { TelegramBotClient } from '../client.js';

const updateTypes = z.enum([
  'message',
  'edited_message',
  'channel_post',
  'edited_channel_post',
  'callback_query',
  'inline_query',
  'chosen_inline_result',
  'poll',
  'poll_answer',
  'my_chat_member',
  'chat_member',
  'chat_join_request',
]);
const input = z.object({ updateTypes: z.array(updateTypes).default([]) });
const jsonValue: z.ZodType<PieceJSON> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
const update = z.object({ update_id: z.number().optional() }).catchall(jsonValue);

export const newUpdate: PieceWebhookTrigger<
  typeof input,
  typeof update,
  object,
  TelegramBotClient,
  { webhookUrl: string }
> = {
  slug: 'newUpdate',
  description: 'Trigger when the bot receives a selected Telegram update.',
  type: 'webhook',
  input,
  output: update,
  sample: {
    update_id: 351114420,
    message: { message_id: 21, text: 'Hello world', chat: { id: 55169542059, type: 'private' } },
  },
  async onEnable({ client, input, webhookUrl }) {
    await client.call('setWebhook', {
      url: webhookUrl,
      allowed_updates: input.updateTypes,
      secret_token: client.webhookSecret,
    });

    return { webhookUrl };
  },
  async onDisable({ client }) {
    await client.call('deleteWebhook');
  },
  async run({ client, input, req }) {
    if (!client.verifyWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'))) return [];

    const delivery = update.parse(req.data);
    const selected = input.updateTypes;
    const matches = selected.length === 0 || selected.some((type) => type in delivery);

    if (!matches) return [];

    const dedupeKey =
      delivery.update_id === undefined
        ? createHash('sha256').update(JSON.stringify(delivery)).digest('hex')
        : String(delivery.update_id);

    return [{ dedupeKey, data: delivery }];
  },
};
