import { describe, expectTypeOf, it } from 'vitest';

import type { BuiltInProviderEntry } from './ai.js';

describe('AI config types', () => {
  it('accepts an environment apiKey for a built-in provider', () => {
    expectTypeOf<{ apiKey: string | undefined }>().toMatchTypeOf<BuiltInProviderEntry>();
  });
});
