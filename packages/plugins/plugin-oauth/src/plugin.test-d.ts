import { expectTypeOf } from 'vitest';

import { oauthPlugin } from './index.js';
import type { OAuthProvider } from './types.js';

declare const provider: OAuthProvider;

expectTypeOf(oauthPlugin).toBeCallableWith({ providers: [provider] });
