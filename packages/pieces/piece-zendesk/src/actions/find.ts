import { z } from 'zod';

import { signal, type ZendeskClient } from '../client.js';
import { zendeskId } from '../config.js';
import { defineAction } from '../define.js';
import { listPage } from '../pagination.js';
import { comment, group, organization, ticket, user } from '../records.js';

const query = z.string().optional().meta({
  description:
    'More Zendesk search syntax, ANDed with the other inputs, such as created>2026-01-01 or -tags:spam.',
});

const sort = {
  sortBy: z.enum(['created_at', 'updated_at', 'priority', 'status', 'ticket_type']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).default(25),
};

function term(keyword: string, value: string | undefined) {
  return value ? `${keyword}:"${value.replaceAll('"', '')}"` : undefined;
}

async function search<T>(
  client: ZendeskClient,
  item: z.ZodType<T>,
  terms: Array<string | undefined>,
  input: { sortBy?: string; sortOrder?: string; limit: number },
  abort: AbortSignal | undefined,
) {
  const page = await client.data(z.object({ results: z.array(item), count: z.number() }), {
    path: '/api/v2/search',
    query: {
      query: terms.filter(Boolean).join(' '),
      sort_by: input.sortBy,
      sort_order: input.sortOrder,
      per_page: input.limit,
    },
    signal: abort,
  });

  return { results: page.results, count: page.count };
}

function searchOutput<T extends z.ZodType>(item: T) {
  return z.object({
    results: z.array(item),
    count: z.number().meta({ description: 'Every match, not only this page.' }),
  });
}

export const findTickets = defineAction({
  slug: 'findTickets',
  description:
    'Search tickets with Zendesk search; every input given must match. Returns up to limit tickets and the total count.',
  input: z.object({
    text: z
      .string()
      .optional()
      .meta({ description: 'Words in the subject, description or comments.' }),
    status: z.enum(['new', 'open', 'pending', 'hold', 'solved', 'closed']).optional(),
    priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
    type: z.enum(['problem', 'incident', 'question', 'task']).optional(),
    tag: z.string().optional(),
    requesterEmail: z.string().optional(),
    assigneeEmail: z.string().optional(),
    organizationId: zendeskId('Organization ID').optional(),
    query,
    ...sort,
  }),
  output: searchOutput(ticket),
  idempotent: true,
  run: ({ client, input, req }) =>
    search(
      client,
      ticket,
      [
        'type:ticket',
        input.text?.replaceAll('"', ''),
        term('status', input.status),
        term('priority', input.priority),
        term('ticket_type', input.type),
        term('tags', input.tag),
        term('requester', input.requesterEmail),
        term('assignee', input.assigneeEmail),
        term('organization', input.organizationId?.toString()),
        input.query,
      ],
      input,
      signal(req),
    ),
});

export const findUser = defineAction({
  slug: 'findUser',
  description:
    'Search users with Zendesk search; every input given must match. No match returns an empty list.',
  input: z.object({
    email: z.string().optional(),
    name: z.string().optional(),
    role: z.enum(['end-user', 'agent', 'admin']).optional(),
    organization: z.string().optional().meta({ description: 'Organization name.' }),
    tag: z.string().optional(),
    externalId: z.string().optional(),
    query,
    ...sort,
  }),
  output: searchOutput(user),
  idempotent: true,
  run: ({ client, input, req }) =>
    search(
      client,
      user,
      [
        'type:user',
        term('email', input.email),
        term('name', input.name),
        term('role', input.role),
        term('organization', input.organization),
        term('tags', input.tag),
        term('external_id', input.externalId),
        input.query,
      ],
      input,
      signal(req),
    ),
});

export const findOrganization = defineAction({
  slug: 'findOrganization',
  description:
    'Search organizations with Zendesk search; every input given must match. No match returns an empty list.',
  input: z.object({
    name: z.string().optional(),
    domain: z.string().optional(),
    externalId: z.string().optional(),
    tag: z.string().optional(),
    details: z.string().optional(),
    query,
    ...sort,
  }),
  output: searchOutput(organization),
  idempotent: true,
  run: ({ client, input, req }) =>
    search(
      client,
      organization,
      [
        'type:organization',
        term('name', input.name),
        term('domain', input.domain),
        term('external_id', input.externalId),
        term('tags', input.tag),
        term('details', input.details),
        input.query,
      ],
      input,
      signal(req),
    ),
});

export const findAgent = defineAction({
  slug: 'findAgent',
  description:
    'Find the agent or admin with this exact email, or the first whose name matches. null when none does.',
  input: z
    .object({ email: z.string().optional(), name: z.string().optional() })
    .refine((input) => Boolean(input.email || input.name), {
      message: 'findAgent needs an email or a name.',
    }),
  output: z.object({ agent: user.nullable() }),
  idempotent: true,
  async run({ client, input, req }) {
    const { results } = await search(
      client,
      user,
      ['type:user', '-role:end-user', term('email', input.email), term('name', input.name)],
      { limit: 100 },
      signal(req),
    );

    const email = input.email?.toLowerCase();
    const agent = email
      ? results.find((candidate) => candidate.email?.toLowerCase() === email)
      : results[0];

    return { agent: agent ?? null };
  },
});

export const findGroup = defineAction({
  slug: 'findGroup',
  description: 'Find the group with this name, ignoring case. null when none has it.',
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ group: group.nullable() }),
  idempotent: true,
  async run({ client, input, req }) {
    const name = input.name.trim().toLowerCase();
    let cursor: string | undefined;

    do {
      const page = await listPage(client, {
        path: '/api/v2/groups',
        key: 'groups',
        item: group,
        limit: 100,
        cursor,
        paginated: true,
        signal: signal(req),
      });

      const match = page.data.find((candidate) => candidate.name?.trim().toLowerCase() === name);

      if (match) return { group: match };

      cursor = page.pagination.nextCursor ?? undefined;
    } while (cursor);

    return { group: null };
  },
});

export const findLatestComment = defineAction({
  slug: 'findLatestComment',
  description:
    'Get a ticket’s newest public comment, or newest comment of any kind with includePrivate. null when it has none.',
  input: z.object({
    ticketId: zendeskId('Ticket ID'),
    includePrivate: z.boolean().default(false).meta({ description: 'Count internal notes too.' }),
  }),
  output: z.object({ comment: comment.nullable() }),
  idempotent: true,
  async run({ client, input, req }) {
    let cursor: string | undefined;

    do {
      const page = await listPage(client, {
        path: `/api/v2/tickets/${input.ticketId}/comments`,
        key: 'comments',
        item: comment,
        limit: 100,
        cursor,
        paginated: true,
        query: { sort_order: 'desc' },
        signal: signal(req),
      });

      const match = page.data.find((candidate) => input.includePrivate || candidate.public);

      if (match) return { comment: match };

      cursor = page.pagination.nextCursor ?? undefined;
    } while (cursor);

    return { comment: null };
  },
});
