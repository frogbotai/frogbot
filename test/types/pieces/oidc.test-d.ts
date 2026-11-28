import { createOidc } from '@frogbotai/piece-oidc';
import { createOkta } from '@frogbotai/piece-okta';
import type { SignInMethod } from 'frogbot';
import { expectTypeOf } from 'vitest';

const oauth = { clientId: 'client', clientSecret: 'secret' };

expectTypeOf(createOidc({ issuer: 'https://sso.example.com', oauth })).toExtend<SignInMethod>();
expectTypeOf(createOkta({ issuer: 'https://acme.okta.com', oauth })).toExtend<SignInMethod>();

// @ts-expect-error sign-in needs the OAuth app
createOkta({ issuer: 'https://acme.okta.com' });
