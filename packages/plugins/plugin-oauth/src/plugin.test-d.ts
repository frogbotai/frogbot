import { expectTypeOf } from 'vitest';

import { googleProvider, oauthPlugin } from './index.js';
import type { OAuthProviderOptions } from './providers/shared.js';
import type { OAuthProvider } from './types.js';

declare const provider: OAuthProvider;

expectTypeOf(oauthPlugin).toBeCallableWith({ providers: [provider] });
expectTypeOf<OAuthProvider>().toHaveProperty('signIn').toEqualTypeOf<boolean | undefined>();
expectTypeOf<OAuthProviderOptions>().toMatchObjectType<{ signIn?: boolean }>();
expectTypeOf(googleProvider).toBeCallableWith({
  clientId: 'id',
  clientSecret: 'secret',
  signIn: true,
});
