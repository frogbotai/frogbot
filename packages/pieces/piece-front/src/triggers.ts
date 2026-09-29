import { z } from 'zod';

import type { FrontClient } from './client.js';
import { definePollingTrigger } from './define.js';

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

function eventsTrigger<const TSlug extends string, TInput extends z.ZodObject>({
  slug,
  type,
  input,
  limit = 15,
  conversation,
}: {
  slug: TSlug;
  type: string;
  input: TInput;
  limit?: number;
  conversation?: boolean;
}) {
  return definePollingTrigger({
    slug,
    description: `Emit new Front ${type} events.`,
    type: 'polling',
    schedule: '*/5 * * * *',
    input,
    output: eventOutput,
    async run({ client, input, cursor }) {
      const since = typeof cursor === 'number' ? cursor : 0;

      const params = new URLSearchParams({ 'q[types]': type, limit: String(limit) });
      if (input.inboxId) params.set('q[inboxes]', String(input.inboxId));

      const results = await eventPages(client, `/events?${params}`);
      let nextCursor = since;

      const events = results.filter((event): event is Record<string, unknown> => {
        const parsed = eventRecord.safeParse(event);

        if (!parsed.success) return false;

        const emittedAt = Math.floor(Number(parsed.data.emitted_at) * 1000);
        const matches =
          parsed.data.type === type &&
          (!conversation || parsed.data.conversation?.id === input.conversationId);

        if (matches && Number.isFinite(emittedAt)) nextCursor = Math.max(nextCursor, emittedAt);

        return matches && emittedAt > since;
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

export const conversationStatusChanged = definePollingTrigger({
  slug: 'conversationStatusChanged',
  description: 'Emit when a conversation reaches a selected status.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({
    conversationId,
    status: z.enum(['open', 'archived', 'deleted', 'assigned', 'unassigned']),
  }),
  output: eventOutput,
  async run({ client, input, cursor }) {
    const since = typeof cursor === 'number' ? cursor : 0;

    const conversation = await client.request('GET', `/conversations/${input.conversationId}`);
    const parsed = conversationRecord.safeParse(conversation);
    const updatedAt = parsed.success
      ? Math.floor(Number(parsed.data.updated_at) * 1000)
      : Number.NaN;
    const nextCursor = Number.isFinite(updatedAt) ? Math.max(since, updatedAt) : since;
    const events =
      parsed.success && parsed.data.status === input.status && updatedAt > since
        ? [conversation]
        : [];

    return { events, cursor: nextCursor };
  },
});
