import { createZendesk } from '@frogbotai/piece-zendesk';
import { expectTypeOf } from 'vitest';

const zendesk = createZendesk({
  auth: { subdomain: 'acme', email: 'admin@acme.com', apiToken: 'token' },
});

expectTypeOf<Parameters<typeof zendesk.exportTickets>[0]['input']>().toEqualTypeOf<{
  excludeDeleted?: boolean;
  startTime?: string;
  cursor?: string;
}>();

const _export = zendesk.exportTickets({ input: { startTime: '2026-01-01T00:00:00Z' } });

expectTypeOf<Awaited<typeof _export>['pagination']>().toEqualTypeOf<{
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
}>();

expectTypeOf<Awaited<typeof _export>['data'][number]['id']>().toEqualTypeOf<number>();

expectTypeOf<Parameters<typeof zendesk.listTicketComments>[0]['input']>().toEqualTypeOf<{
  ticketId: number;
  limit?: number;
  cursor?: string;
}>();

const _comments = zendesk.listTicketComments({ input: { ticketId: 1 } });

expectTypeOf<Awaited<typeof _comments>['data'][number]['public']>().toEqualTypeOf<boolean>();
expectTypeOf<Awaited<typeof _comments>['pagination']['limit']>().toEqualTypeOf<number>();

// @ts-expect-error listTicketComments needs a ticket
void zendesk.listTicketComments({ input: {} });

expectTypeOf<keyof typeof zendesk.triggers>().toEqualTypeOf<
  | 'ticketCreated'
  | 'ticketUpdated'
  | 'ticketTagAdded'
  | 'ticketCommentAdded'
  | 'organizationCreated'
  | 'userCreated'
  | 'userTagAdded'
  | 'ticketInView'
  | 'groupCreated'
  | 'suspendedTicketCreated'
>();

expectTypeOf(zendesk.triggers.ticketCreated.type).toEqualTypeOf<'webhook'>();

expectTypeOf(zendesk.triggers.ticketInView.type).toEqualTypeOf<'polling'>();
