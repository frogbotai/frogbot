import type { PiecePollingTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { FrontClient } from './client.js';

const eventOutput = z.record(z.string(), z.unknown());
const conversationId = z.string().min(1).meta({ label: 'Conversation' });
const inboxId = z.string().min(1).meta({ label: 'Inbox' }).optional();
const eventRecord = z.object({
  emitted_at: z.union([z.string(), z.number()]),
  type: z.unknown(),
  conversation: z.object({ id: z.unknown() }).optional(),
});
const conversationRecord = z.object({
  status: z.unknown(),
  updated_at: z.union([z.string(), z.number()]),
});

function pollingTrigger<TInput extends z.ZodType>(
  definition: PiecePollingTrigger<TInput, typeof eventOutput, object, FrontClient, number>,
) {
  return definition;
}

async function eventPages(client: FrontClient, path: string) {
  const events: unknown[] = [];
  let next: string | undefined = path;

  while (next) {
    const response = await client.request('GET', next);

    if (Array.isArray(response._results)) events.push(...response._results);

    const pagination = response._pagination;
    next =
      pagination &&
      typeof pagination === 'object' &&
      'next' in pagination &&
      typeof pagination.next === 'string'
        ? pagination.next
        : undefined;
  }

  return events;
}

function eventsTrigger<TInput extends z.ZodObject>({
  slug,
  type,
  input,
  limit = 15,
  conversation,
}: {
  slug: string;
  type: string;
  input: TInput;
  limit?: number;
  conversation?: boolean;
}) {
  return pollingTrigger({
    slug,
    description: `Emit new Front ${type} events.`,
    type: 'polling' as const,
    schedule: '*/5 * * * *',
    input,
    output: eventOutput,
    async run({ client, input, cursor }) {
      const params = new URLSearchParams({ 'q[types]': type, limit: String(limit) });
      if (input.inboxId) params.set('q[inboxes]', String(input.inboxId));

      const results = await eventPages(client, `/events?${params}`);
      let nextCursor = cursor ?? 0;

      const events = results.filter((event): event is Record<string, unknown> => {
        const parsed = eventRecord.safeParse(event);

        if (!parsed.success) return false;

        const emittedAt = Math.floor(Number(parsed.data.emitted_at) * 1000);
        const matches =
          parsed.data.type === type &&
          (!conversation || parsed.data.conversation?.id === input.conversationId);

        if (matches && Number.isFinite(emittedAt)) nextCursor = Math.max(nextCursor, emittedAt);

        return matches && emittedAt > (cursor ?? 0);
      });

      return { events, cursor: nextCursor };
    },
  });
}

export const commentCreated = eventsTrigger({
  slug: 'commentCreated',
  type: 'comment',
  input: z.object({ conversationId }),
  conversation: true,
});
export const inboundMessageCreated = eventsTrigger({
  slug: 'inboundMessageCreated',
  type: 'inbound',
  input: z.object({ inboxId }),
});
export const outboundMessageCreated = eventsTrigger({
  slug: 'outboundMessageCreated',
  type: 'outbound',
  input: z.object({ inboxId }),
});
export const conversationTagAdded = eventsTrigger({
  slug: 'conversationTagAdded',
  type: 'tag',
  input: z.object({ conversationId }),
  limit: 50,
  conversation: true,
});

export const conversationStatusChanged = pollingTrigger({
  slug: 'conversationStatusChanged',
  description: 'Emit when a conversation reaches a selected status.',
  type: 'polling' as const,
  schedule: '*/5 * * * *',
  input: z.object({
    conversationId,
    status: z.enum(['open', 'archived', 'deleted', 'assigned', 'unassigned']),
  }),
  output: eventOutput,
  async run({ client, input, cursor }) {
    const conversation = await client.request('GET', `/conversations/${input.conversationId}`);
    const parsed = conversationRecord.safeParse(conversation);
    const updatedAt = parsed.success
      ? Math.floor(Number(parsed.data.updated_at) * 1000)
      : Number.NaN;
    const nextCursor = Number.isFinite(updatedAt)
      ? Math.max(cursor ?? 0, updatedAt)
      : (cursor ?? 0);
    const events =
      parsed.success && parsed.data.status === input.status && updatedAt > (cursor ?? 0)
        ? [conversation]
        : [];

    return { events, cursor: nextCursor };
  },
});
