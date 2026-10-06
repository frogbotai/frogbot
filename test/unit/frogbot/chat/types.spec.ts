import { describe, expectTypeOf, it } from 'vitest';

import type { AgentProfile, ManifestResponse } from '../../../../packages/frogbot/src/index.js';

describe('ManifestResponse', () => {
  it('exports the manifest response contract', () => {
    expectTypeOf<ManifestResponse>().toEqualTypeOf<{
      ai: { transcribe: { model: string } | false };
      chat:
        | { enabled: false }
        | { enabled: true; chatsSlug: string; messagesSlug: string; assetsSlug: string };
      files?: { slug: string };
      agents: { slug: string; profile?: AgentProfile }[];
    }>();
  });
});
