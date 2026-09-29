import { createFront } from '@frogbotai/piece-front';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const front = createFront({});
const developerFront = createFront({ auth: { apiToken: 'token' } });

const link = front.createLink({
  input: { name: 'Order', externalUrl: 'https://example.com/orders/1' },
  req,
});

expectTypeOf<Parameters<typeof front.createLink>[0]['input']>().toEqualTypeOf<{
  name: string;
  externalUrl: string;
  pattern?: string | undefined;
}>();
expectTypeOf(link).toEqualTypeOf<Promise<Record<string, unknown>>>();
expectTypeOf(
  developerFront.createLink({
    input: { name: 'Order', externalUrl: 'https://example.com/orders/1' },
  }),
).toEqualTypeOf<Promise<Record<string, unknown>>>();

// @ts-expect-error createLink does not accept addComment input
front.createLink({ input: { conversationId: 'cnv', authorId: 'tea', body: 'Hi' }, req });

const handle = front.addContactHandle({
  input: { contactId: 'crd', source: 'email', handle: 'a@example.com' },
  req,
});

expectTypeOf(handle).toEqualTypeOf<Promise<{ success: true; message: string }>>();
expectTypeOf<Parameters<typeof front.updateLink>[0]['input']>().toEqualTypeOf<{
  linkId: string;
  name?: string | undefined;
  externalUrl?: string | undefined;
}>();

expectTypeOf<keyof typeof front.triggers>().toEqualTypeOf<
  | 'commentCreated'
  | 'inboundMessageCreated'
  | 'outboundMessageCreated'
  | 'conversationTagAdded'
  | 'conversationStatusChanged'
>();
expectTypeOf(front.triggers.conversationStatusChanged.type).toEqualTypeOf<'polling'>();
