import { z } from 'zod';

import { signal, type ZendeskClient } from '../client.js';
import { zendeskId } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { listPage } from '../pagination.js';
import { group, suspendedTicket, ticket } from '../records.js';

const schedule = '*/5 * * * *';
const pageSize = 100;
const maxViewTickets = 500;
const maxPages = 20;

async function readPages<T>(
  client: ZendeskClient,
  request: { path: string; key: string; item: z.ZodType<T>; query?: Record<string, string> },
  {
    pages,
    abort,
    until,
  }: { pages: number; abort: AbortSignal | undefined; until?: (items: T[]) => boolean },
) {
  const items: T[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < pages; page++) {
    const result = await listPage(client, {
      ...request,
      limit: pageSize,
      cursor,
      paginated: true,
      signal: abort,
    });

    items.push(...result.data);

    if (!result.pagination.nextCursor || until?.(result.data)) break;

    cursor = result.pagination.nextCursor;
  }

  return items;
}

const viewCursor = z.object({ ids: z.array(z.number()) });

export const ticketInView = definePollingTrigger({
  slug: 'ticketInView',
  description: `Emit each ticket that newly appears in a view. Only the view's first ${maxViewTickets} tickets, in the view's order, are watched. The first poll emits nothing.`,
  type: 'polling',
  schedule,
  input: z.object({ viewId: zendeskId('View ID') }),
  output: ticket,
  async run({ client, input, cursor, req }) {
    const tickets = (
      await readPages(
        client,
        { path: `/api/v2/views/${input.viewId}/tickets`, key: 'tickets', item: ticket },
        { pages: maxViewTickets / pageSize, abort: signal(req) },
      )
    ).slice(0, maxViewTickets);

    const next = { ids: tickets.map((item) => item.id) };
    const previous = viewCursor.safeParse(cursor);

    if (!previous.success) return { events: [], cursor: next };

    const seen = new Set(previous.data.ids);

    return { events: tickets.filter((item) => !seen.has(item.id)), cursor: next };
  },
});

const groupCursor = z.object({ createdAt: z.string(), ids: z.array(z.number()) });

export const groupCreated = definePollingTrigger({
  slug: 'groupCreated',
  description: 'Emit each new agent group, oldest first. The first poll emits nothing.',
  type: 'polling',
  schedule,
  input: z.object({}),
  output: group,
  async run({ client, cursor, req }) {
    const groups = await readPages(
      client,
      { path: '/api/v2/groups', key: 'groups', item: group },
      { pages: maxPages, abort: signal(req) },
    );

    const dated = groups
      .map((item) => ({ item, created: Date.parse(item.created_at ?? '') }))
      .filter(({ created }) => Number.isFinite(created))
      .sort((a, b) => a.created - b.created || a.item.id - b.item.id);

    const previous = groupCursor.safeParse(cursor);

    if (!previous.success) return { events: [], cursor: groupMark(dated, undefined) };

    const since = Date.parse(previous.data.createdAt);
    const seen = new Set(previous.data.ids);
    const events = dated
      .filter(({ item, created }) => created > since || (created === since && !seen.has(item.id)))
      .map(({ item }) => item);

    return { events, cursor: groupMark(dated, previous.data) };
  },
});

function groupMark(
  dated: Array<{ item: { id: number }; created: number }>,
  previous: z.output<typeof groupCursor> | undefined,
) {
  const newest = dated.at(-1)?.created;

  if (newest === undefined) return previous ?? { createdAt: new Date(0).toISOString(), ids: [] };

  const ids = dated.filter(({ created }) => created === newest).map(({ item }) => item.id);
  const kept = previous && Date.parse(previous.createdAt) === newest ? previous.ids : [];

  return { createdAt: new Date(newest).toISOString(), ids: [...new Set([...kept, ...ids])] };
}

const suspendedCursor = z.object({ lastId: z.number() });

export const suspendedTicketCreated = definePollingTrigger({
  slug: 'suspendedTicketCreated',
  description:
    'Emit each new suspended ticket, oldest first. Zendesk sends no event for these, so this polls. The first poll emits nothing.',
  type: 'polling',
  schedule,
  input: z.object({}),
  output: suspendedTicket,
  async run({ client, cursor, req }) {
    const previous = suspendedCursor.safeParse(cursor);
    const lastId = previous.success ? previous.data.lastId : undefined;
    const items = await readPages(
      client,
      {
        path: '/api/v2/suspended_tickets',
        key: 'suspended_tickets',
        item: suspendedTicket,
        query: { sort_by: 'created_at', sort_order: 'desc' },
      },
      {
        pages: lastId === undefined ? 1 : maxPages,
        abort: signal(req),
        until: (page) => lastId !== undefined && page.some((item) => item.id <= lastId),
      },
    );

    const next = { lastId: Math.max(lastId ?? 0, ...items.map((item) => item.id)) };

    if (lastId === undefined) return { events: [], cursor: next };

    return {
      events: items.filter((item) => item.id > lastId).sort((a, b) => a.id - b.id),
      cursor: next,
    };
  },
});
