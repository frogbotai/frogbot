import { createHash } from 'node:crypto';

import type { PieceAppTrigger, PieceJSON } from 'frogbot/pieces';
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

export const newUpdate: PieceAppTrigger<typeof input, typeof update, object, TelegramBotClient> = {
  slug: 'newUpdate',
  description: 'Trigger when the bot receives a selected Telegram update.',
  type: 'app',
  event: 'update',
  input,
  output: update,
  sample: {
    update_id: 351114420,
    message: { message_id: 21, text: 'Hello world', chat: { id: 55169542059, type: 'private' } },
  },
  async run({ input, req }) {
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
