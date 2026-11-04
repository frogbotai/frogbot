import { z } from 'zod';

import { signal } from '../client.js';
import { zendeskId } from '../config.js';
import { defineAction } from '../define.js';
import { listInput, listOutput, listPage } from '../pagination.js';
import { comment, field, group, named } from '../records.js';

function listAction<
  const TSlug extends string,
  TShape extends z.ZodRawShape,
  TItem extends z.ZodType,
>({
  slug,
  description,
  input,
  item,
  key,
  path,
  paginated = true,
}: {
  slug: TSlug;
  description: string;
  input: TShape;
  item: TItem;
  key: string;
  path: (input: z.output<z.ZodObject<TShape>>) => string;
  paginated?: boolean;
}) {
  return defineAction({
    slug,
    description,
    input: z.object({ ...input, ...listInput }),
    output: listOutput(item),
    idempotent: true,
    run({ client, input: values, req }) {
      const paging = values as { limit: number; cursor?: string };

      return listPage(client, {
        path: path(values as z.output<z.ZodObject<TShape>>),
        key,
        item: item as z.ZodType<z.output<TItem>>,
        limit: paging.limit,
        cursor: paging.cursor,
        paginated,
        signal: signal(req),
      });
    },
  });
}

export const listTicketComments = listAction({
  slug: 'listTicketComments',
  description:
    'List one page of a ticket’s comments, oldest first: public replies and internal notes (public: false), each with its attachments.',
  input: { ticketId: zendeskId('Ticket ID') },
  item: comment,
  key: 'comments',
  path: (input) => `/api/v2/tickets/${input.ticketId}/comments`,
});

export const listGroups = listAction({
  slug: 'listGroups',
  description: 'List one page of the account’s agent groups.',
  input: {},
  item: group,
  key: 'groups',
  path: () => '/api/v2/groups',
});

export const listTicketFields = listAction({
  slug: 'listTicketFields',
  description: 'List one page of ticket field definitions, system and custom.',
  input: {},
  item: field,
  key: 'ticket_fields',
  path: () => '/api/v2/ticket_fields',
});

export const listUserFields = listAction({
  slug: 'listUserFields',
  description: 'List one page of custom user field definitions.',
  input: {},
  item: field,
  key: 'user_fields',
  path: () => '/api/v2/user_fields',
});

export const listOrganizationFields = listAction({
  slug: 'listOrganizationFields',
  description: 'List one page of custom organization field definitions.',
  input: {},
  item: field,
  key: 'organization_fields',
  path: () => '/api/v2/organization_fields',
});

export const listCategories = listAction({
  slug: 'listCategories',
  description: 'List one page of help-center categories.',
  input: {},
  item: named,
  key: 'categories',
  path: () => '/api/v2/help_center/categories',
});

export const listSections = listAction({
  slug: 'listSections',
  description: 'List one page of help-center sections; each has its category_id.',
  input: {},
  item: named,
  key: 'sections',
  path: () => '/api/v2/help_center/sections',
});

export const listMacros = listAction({
  slug: 'listMacros',
  description: 'List one page of macros, as Zendesk stores them, with their actions.',
  input: {},
  item: named,
  key: 'macros',
  path: () => '/api/v2/macros',
});

export const listViews = listAction({
  slug: 'listViews',
  description: 'List one page of views, as Zendesk stores them, with their conditions.',
  input: {},
  item: named,
  key: 'views',
  path: () => '/api/v2/views',
});

export const listSlaPolicies = listAction({
  slug: 'listSlaPolicies',
  description:
    'List every SLA policy, as Zendesk stores them. Zendesk returns them all at once, so hasMore is always false.',
  input: {},
  item: named,
  key: 'sla_policies',
  path: () => '/api/v2/slas/policies',
  paginated: false,
});
