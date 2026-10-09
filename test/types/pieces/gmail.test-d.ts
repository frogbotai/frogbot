import type { gmailScopes } from '@frogbotai/piece-gmail';
import { createGmail } from '@frogbotai/piece-gmail';
import type { googleScopes } from '@frogbotai/piece-google';
import type { CustomApiCallOutput } from 'frogbot/pieces';
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

const oauth = { clientId: 'client', clientSecret: 'secret' };

createGmail({ oauth, scopes: ({ defaultScopes }) => [...defaultScopes, 'gmail.labels'] });
createGmail({ oauth, scopes: ['gmail.readonly'] });

createGmail({
  oauth,
  scopes: ({ defaultScopes }) => defaultScopes.filter((scope) => scope !== 'gmail.compose'),
});

type GmailScopes = NonNullable<NonNullable<Parameters<typeof createGmail>[0]>['scopes']>;

expectTypeOf<Extract<GmailScopes, readonly unknown[]>[number]>().toEqualTypeOf<
  keyof typeof gmailScopes | keyof typeof googleScopes
>();

// @ts-expect-error gmail.lables is not a Gmail scope name
createGmail({ oauth, scopes: ({ defaultScopes }) => [...defaultScopes, 'gmail.lables'] });

// @ts-expect-error gmail.lables is not a Gmail scope name
createGmail({ oauth, scopes: ['gmail.lables'] });

// @ts-expect-error scopes belong on the factory, not the OAuth app
createGmail({ oauth: { ...oauth, scopes: ['gmail.labels'] } });

const _profile = gmail.customApiCall({ input: { method: 'GET', path: '/users/me/profile' } });

expectTypeOf<Awaited<typeof _profile>>().toEqualTypeOf<CustomApiCallOutput>();
