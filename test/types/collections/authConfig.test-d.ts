import type { AuthConfig, CollectionConfig } from 'frogbot';
import type { IncomingAuthType } from 'payload';
import { expectTypeOf } from 'vitest';

type ForgotPassword = NonNullable<AuthConfig['forgotPassword']>;
type Verify = Exclude<NonNullable<AuthConfig['verify']>, boolean>;
type PayloadForgotPassword = NonNullable<IncomingAuthType['forgotPassword']>;

expectTypeOf<AuthConfig['removeTokenFromResponses']>().toEqualTypeOf<
  IncomingAuthType['removeTokenFromResponses']
>();
expectTypeOf<ForgotPassword['expiration']>().toEqualTypeOf<PayloadForgotPassword['expiration']>();
expectTypeOf<ForgotPassword['minRequestInterval']>().toEqualTypeOf<
  PayloadForgotPassword['minRequestInterval']
>();
expectTypeOf<ForgotPassword['generateEmailHTML']>().toEqualTypeOf<Verify['generateEmailHTML']>();
expectTypeOf<ForgotPassword['generateEmailSubject']>().toEqualTypeOf<Verify['generateEmailHTML']>();
expectTypeOf<Verify['generateEmailSubject']>().toEqualTypeOf<Verify['generateEmailHTML']>();

export const Customers: CollectionConfig = {
  slug: 'customers',
  auth: {
    removeTokenFromResponses: true,
    verify: {
      generateEmailHTML: ({ token }) => `<a href="/verify/${token}">Verify</a>`,
      generateEmailSubject: async ({ user }) => `Verify ${String(user)}`,
    },
    forgotPassword: {
      expiration: 600_000,
      minRequestInterval: 0,
      generateEmailHTML: ({ token }) => `<a href="/reset/${token}">Reset</a>`,
      generateEmailSubject: () => 'Reset your password',
    },
  },
  fields: [],
};

export const removeTokenFalse: AuthConfig = {
  // @ts-expect-error tokens are removed with `true`; omit the key to keep them
  removeTokenFromResponses: false,
};

export const apiKeys: AuthConfig = {
  // @ts-expect-error API keys come from the api-keys plugin
  useAPIKey: true,
};
