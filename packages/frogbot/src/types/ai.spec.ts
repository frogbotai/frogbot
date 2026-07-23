import { describe, expectTypeOf, it } from 'vitest';

import type { BedrockProviderEntry, BuiltInProviderEntry } from './ai.js';

describe('AI config types', () => {
  it('accepts an environment apiKey for a built-in provider', () => {
    expectTypeOf<{ apiKey: string | undefined }>().toMatchTypeOf<BuiltInProviderEntry>();
  });

  it('accepts omitted API keys and ambient Bedrock credentials', () => {
    expectTypeOf<{}>().toMatchTypeOf<BuiltInProviderEntry>();
    expectTypeOf<{}>().toMatchTypeOf<BedrockProviderEntry>();
  });
});
