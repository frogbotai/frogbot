import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { exportInput, exportOutput, exportPage } from '../pagination.js';
import { article, organization, ticket, ticketEvent, user } from '../records.js';

const limits =
  'Zendesk allows 10 export requests a minute (20 for users) and never returns the last minute; a 429 is retried after Retry-After.';

export const exportTickets = defineAction({
  slug: 'exportTickets',
  description: `Export one page of tickets changed since startTime, oldest first, including closed and archived ones. Admins only. ${limits}`,
  input: exportInput({
    excludeDeleted: z
      .boolean()
      .optional()
      .meta({ description: 'Leave out deleted tickets. They are included by default.' }),
  }),
  output: exportOutput(ticket),
  idempotent: true,
  run: ({ client, input, req }) =>
    exportPage(client, {
      path: '/api/v2/incremental/tickets/cursor',
      key: 'tickets',
      item: ticket,
      kind: 'cursor',
      input,
      query: { exclude_deleted: input.excludeDeleted },
      signal: signal(req),
    }),
});

export const exportUsers = defineAction({
  slug: 'exportUsers',
  description: `Export one page of users changed since startTime, oldest first. Admins only. ${limits}`,
  input: exportInput({}),
  output: exportOutput(user),
  idempotent: true,
  run: ({ client, input, req }) =>
    exportPage(client, {
      path: '/api/v2/incremental/users/cursor',
      key: 'users',
      item: user,
      kind: 'cursor',
      input,
      signal: signal(req),
    }),
});

export const exportOrganizations = defineAction({
  slug: 'exportOrganizations',
  description: `Export one page of organizations changed since startTime, oldest first. Admins only. ${limits}`,
  input: exportInput({}),
  output: exportOutput(organization),
  idempotent: true,
  run: ({ client, input, req }) =>
    exportPage(client, {
      path: '/api/v2/incremental/organizations',
      key: 'organizations',
      item: organization,
      kind: 'time',
      input,
      signal: signal(req),
    }),
});

export const exportTicketEvents = defineAction({
  slug: 'exportTicketEvents',
  description: `Export one page of ticket events since startTime, with each comment, public or internal, in child_events. Admins only. ${limits}`,
  input: exportInput({}),
  output: exportOutput(ticketEvent),
  idempotent: true,
  run: ({ client, input, req }) =>
    exportPage(client, {
      path: '/api/v2/incremental/ticket_events',
      key: 'ticket_events',
      item: ticketEvent,
      kind: 'time',
      input,
      query: { include: 'comment_events' },
      signal: signal(req),
    }),
});

export const exportArticles = defineAction({
  slug: 'exportArticles',
  description: `Export one page of help-center articles changed since startTime, oldest first. ${limits}`,
  input: exportInput({}),
  output: exportOutput(article),
  idempotent: true,
  run: ({ client, input, req }) =>
    exportPage(client, {
      path: '/api/v2/help_center/incremental/articles',
      key: 'articles',
      item: article,
      kind: 'time',
      input,
      signal: signal(req),
    }),
});
