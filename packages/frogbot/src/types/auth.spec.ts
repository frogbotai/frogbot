import { describe, expectTypeOf, it } from 'vitest';

import type { AuthConfig } from './auth.js';

describe('AuthConfig', () => {
  it('accepts Payload authentication strategies', () => {
    expectTypeOf<{
      strategies: [{ name: 'custom'; authenticate: () => { user: null } }];
    }>().toMatchTypeOf<AuthConfig>();
  });

  it('rejects invalid authentication strategies', () => {
    expectTypeOf<{
      strategies: [{ name: 'custom'; authenticate: 'invalid' }];
    }>().not.toMatchTypeOf<AuthConfig>();
  });
});
