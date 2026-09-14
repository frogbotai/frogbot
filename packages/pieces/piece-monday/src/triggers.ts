import { createHash } from 'node:crypto';

import type { PieceWebhookTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { Monday } from './client.js';
import { type MondayColumnValue, parseColumnValue } from './columns.js';

const boardId = z.string().min(1).meta({ label: 'Board ID' });
const columnId = z.string().min(1).meta({ label: 'Column ID' });
const triggerInput = z.object({ boardId });
const triggerOutput = z.record(z.string(), z.unknown());
const itemEvent = z.object({
  boardId: z.union([z.string(), z.number()]),
  pulseId: z.union([z.string(), z.number()]),
});

function dedupe(data: unknown) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function webhookTrigger<TInput extends z.ZodObject>({
  slug,
  event,
  input,
  enrich = false,
}: {
  slug: string;
  event: string;
  input: TInput;
  enrich?: boolean;
}): PieceWebhookTrigger<
  TInput,
  typeof triggerOutput,
  Record<string, never>,
  Monday,
  { webhookId: string }
> {
  return {
    slug,
    description:
      slug === 'itemCreated'
        ? 'Trigger when an item is created on a board.'
        : 'Trigger when a selected column changes.',
    type: 'webhook',
    input,
    output: triggerOutput,
    async onEnable({ input, client, webhookUrl, req }) {
      const config = 'columnId' in input ? JSON.stringify({ columnId: input.columnId }) : undefined;
      const data = await client.query<{ create_webhook: { id: string } }>(
        'mutation($boardId: ID!, $url: String!, $event: WebhookEventType!, $config: JSON) { create_webhook(board_id: $boardId, url: $url, event: $event, config: $config) { id board_id } }',
        { boardId: input.boardId, url: webhookUrl, event, config },
        req.signal ?? undefined,
      );

      return { webhookId: data.create_webhook.id };
    },
    async onDisable({ state, client, req }) {
      await client.query(
        'mutation($webhookId: ID!) { delete_webhook(id: $webhookId) { id board_id } }',
        { webhookId: state.webhookId },
        req.signal ?? undefined,
      );
    },
    async run({ req, client }) {
      const delivery = triggerOutput.parse(req.data);

      if (!enrich) return [{ dedupeKey: dedupe(delivery), data: delivery }];

      const eventData = itemEvent.safeParse(delivery.event);

      if (!eventData.success) return [{ dedupeKey: dedupe(delivery), data: delivery }];

      let data: {
        boards: Array<{ items_page: { items: Array<{ column_values: MondayColumnValue[] }> } }>;
      };

      try {
        data = await client.query(
          'query($boardId: ID!, $itemId: ID!) { boards(ids: [$boardId]) { items_page(query_params: { ids: [$itemId] }) { items { column_values { id type value text ... on ButtonValue { label } ... on StatusValue { label } } } } } }',
          { boardId: eventData.data.boardId, itemId: eventData.data.pulseId },
          req.signal ?? undefined,
        );
      } catch (error) {
        if (req.signal?.aborted) throw req.signal.reason ?? error;

        return [{ dedupeKey: dedupe(delivery), data: delivery }];
      }

      const values: Record<string, unknown> = {};

      for (const column of data.boards[0]?.items_page.items[0]?.column_values ?? []) {
        values[column.id] = parseColumnValue(column);
      }

      const enriched = { ...delivery, columnValues: values };

      return [{ dedupeKey: dedupe(enriched), data: enriched }];
    },
  };
}

export const itemCreated = webhookTrigger({
  slug: 'itemCreated',
  event: 'create_item',
  input: triggerInput,
  enrich: true,
});
export const columnUpdated = webhookTrigger({
  slug: 'columnUpdated',
  event: 'change_specific_column_value',
  input: triggerInput.extend({ columnId }),
});

export const mondayTriggers = [itemCreated, columnUpdated];
