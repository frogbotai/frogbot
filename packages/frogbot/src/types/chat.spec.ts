import { describe, expectTypeOf, it } from 'vitest';

import type { ManifestResponse } from '../index.js';

describe('ManifestResponse', () => {
  it('exports the manifest response contract', () => {
    expectTypeOf<ManifestResponse>().toEqualTypeOf<{
      chat:
        | { enabled: false }
        | { enabled: true; threadsSlug: string; messagesSlug: string };
      agents: { slug: string }[];
    }>();
  });
});
