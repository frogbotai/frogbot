import { createHash } from 'node:crypto';

import { type PieceRunArgs, type PieceWebhookTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { Trello } from './client.js';
import { cardOutput } from './schemas.js';

type Delivery = {
  action?: {
    display?: {
      entities?: Record<string, { id?: string }>;
      translationKey?: string;
    };
  };
};

type WebhookState = {
  webhookId: string;
  webhookUrl: string;
  owned: boolean;
};

function webhookTrigger({
  slug,
  description,
  input,
  model,
  matches,
}: {
  slug: string;
  description: string;
  input: z.ZodObject;
  model: (input: Record<string, unknown>) => string;
  matches: (delivery: Delivery, input: Record<string, unknown>) => string | undefined;
}): PieceWebhookTrigger<
  z.ZodObject,
  typeof cardOutput,
  Record<string, never>,
  Trello,
  WebhookState
> {
  return {
    slug,
    description,
    type: 'webhook',
    input,
    output: cardOutput,
    async onEnable({ client, input, webhookUrl }) {
      const idModel = model(input);
      const existing = (await client.listWebhooks()).find(
        (webhook) => webhook.idModel === idModel && webhook.callbackURL === webhookUrl,
      );
      const webhook = existing ?? (await client.createWebhook(idModel, webhookUrl));

      return { webhookId: webhook.id, webhookUrl, owned: !existing };
    },
    async onDisable({ client, state }) {
      if (state.owned) await client.deleteWebhook(state.webhookId);
    },
    async run({ client, input, req, state }) {
      if (!req.arrayBuffer) throw new Error('Trello webhook raw body is unavailable.');

      const body = Buffer.from(await req.arrayBuffer());
      const signature = req.headers.get('x-trello-webhook');

      if (!client.verifyWebhook(body, signature, state.webhookUrl)) {
        throw new Error('Trello webhook signature is invalid.');
      }

      const delivery = req.data as Delivery;
      const cardId = matches(delivery, input);

      if (!cardId) return [];

      const card = cardOutput.parse(await client.getCard(cardId));

      return [
        {
          dedupeKey: createHash('sha256').update(JSON.stringify(delivery)).digest('hex'),
          data: card,
        },
      ];
    },
  };
}

const boardListInput = z.object({
  boardId: z.string().min(1),
  listId: z.string().optional(),
});

export const cardCreated = webhookTrigger({
  slug: 'cardCreated',
  description: 'Emit a card created on a board or optional list.',
  input: boardListInput,
  model: (input) => String(input.listId ?? input.boardId),
  matches(delivery, input) {
    const display = delivery.action?.display;

    if (display?.translationKey !== 'action_create_card') return undefined;
    if (input.listId && display.entities?.list?.id !== input.listId) return undefined;

    return display.entities?.card?.id;
  },
});

const movedInput = z.object({ boardId: z.string().min(1), listId: z.string().min(1) });

export const cardMovedToList = webhookTrigger({
  slug: 'cardMovedToList',
  description: 'Emit a card moved into a selected list.',
  input: movedInput,
  model: (input) => String(input.listId),
  matches(delivery, input) {
    const display = delivery.action?.display;

    if (display?.translationKey !== 'action_move_card_from_list_to_list') return undefined;
    if (display.entities?.listAfter?.id !== input.listId) return undefined;
    if (display.entities?.listBefore?.id === input.listId) return undefined;

    return display.entities?.card?.id;
  },
});

const deadlineInput = z.object({
  boardId: z.string().min(1),
  listId: z.string().optional(),
  timeUnit: z.enum(['minutes', 'hours']).default('hours'),
  timeBeforeDue: z.number().min(0).default(24),
});

export const cardDeadline = {
  slug: 'cardDeadline',
  description: 'Emit cards approaching their due date.',
  type: 'polling' as const,
  schedule: '*/5 * * * *',
  input: deadlineInput,
  output: cardOutput,
  async run({
    client,
    input,
    cursor,
  }: PieceRunArgs<z.output<typeof deadlineInput>, Record<string, never>, Trello> & {
    cursor?: number;
  }) {
    const path = input.listId ? `lists/${input.listId}/cards` : `boards/${input.boardId}/cards`;
    const cards = await client.listAll<z.output<typeof cardOutput>>(path);
    const now = Date.now();
    const range = input.timeBeforeDue * (input.timeUnit === 'minutes' ? 60_000 : 3_600_000);
    const events = cards.filter((card) => {
      const due = card.due ? Date.parse(card.due) : Number.NaN;

      return !card.dueComplete && due > now && due < now + range && due > (cursor ?? 0);
    });
    const latest = events.reduce(
      (value, card) => Math.max(value, Date.parse(card.due!)),
      cursor ?? 0,
    );

    return { events, cursor: latest };
  },
};
