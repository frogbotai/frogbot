import { createGmail } from '@frogbotai/piece-gmail';
import { expectTypeOf } from 'vitest';

const gmail = createGmail({ auth: { accessToken: 'token' } });

const _sent = gmail.send({
  input: { to: ['a@example.com'], subject: 'Hello', body: 'Hi there' },
});

expectTypeOf<Parameters<typeof gmail.send>[0]['input']['to']>().toEqualTypeOf<string[]>();
expectTypeOf<Parameters<typeof gmail.send>[0]['input']['draft']>().toEqualTypeOf<
  boolean | undefined
>();
expectTypeOf<Awaited<typeof _sent>['threadId']>().toEqualTypeOf<string | undefined>();

const _sendRejectsGetEmailInput = () =>
  // @ts-expect-error send does not accept getEmail input
  gmail.send({ input: { messageId: 'message' } });

const _found = gmail.searchEmails({ input: { from: 'a@example.com', maxResults: 10 } });

expectTypeOf<Awaited<typeof _found>[number]['snippet']>().toEqualTypeOf<string | undefined>();

expectTypeOf<keyof typeof gmail.triggers>().toEqualTypeOf<'newEmail'>();
expectTypeOf(gmail.triggers.newEmail.type).toEqualTypeOf<'polling'>();
