import { createMicrosoftOutlook, defineMicrosoftOutlook } from '@frogbotai/piece-microsoft-outlook';
import { expectTypeOf } from 'vitest';

const outlook = createMicrosoftOutlook({ auth: { accessToken: 'token' } });

createMicrosoftOutlook({
  auth: {
    tenantId: 'contoso.onmicrosoft.com',
    clientId: 'client',
    clientSecret: 'secret',
    mailbox: 'sales@acme.com',
  },
});

defineMicrosoftOutlook({ cloud: 'usGovernment', tenantId: 'contoso.onmicrosoft.com' });

expectTypeOf<Parameters<typeof outlook.sendEmail>[0]['input']>().toEqualTypeOf<{
  to: string[];
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject: string;
  body: string;
  bodyType?: 'text' | 'html' | undefined;
  attachments?: { fileId: string | number; name?: string | undefined }[] | undefined;
}>();

const _sent = outlook.sendEmail({ input: { to: ['a@example.com'], subject: 'Hi', body: 'Hello' } });

expectTypeOf<Awaited<typeof _sent>>().toEqualTypeOf<{ sent: true }>();

const _sendRejectsSearchInput = () =>
  // @ts-expect-error sendEmail does not accept searchEmails input
  outlook.sendEmail({ input: { query: 'invoice' } });

const _page = outlook.listEmails({ input: { folderId: 'inbox', limit: 10 } });

expectTypeOf<Awaited<typeof _page>['pagination']['nextCursor']>().toEqualTypeOf<string | null>();
expectTypeOf<Awaited<typeof _page>['data'][number]['id']>().toEqualTypeOf<string>();

const _deleted = outlook.deleteEvent({ input: { eventId: 'event' } });

expectTypeOf<Awaited<typeof _deleted>>().toEqualTypeOf<{ eventId: string; found: boolean }>();

expectTypeOf<keyof typeof outlook.triggers>().toEqualTypeOf<
  'newEmail' | 'newEmailInFolder' | 'newAttachment'
>();

expectTypeOf(outlook.triggers.newEmail.type).toEqualTypeOf<'polling'>();

// @ts-expect-error only the commercial and US Government clouds exist
defineMicrosoftOutlook({ cloud: 'china' });
