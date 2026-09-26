import type * as Gateway from '@frogbotai/gateway';
import { describe, expect, it, vi } from 'vitest';

import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';

vi.mock('@frogbotai/gateway', async (importOriginal) => {
  const original = await importOriginal<typeof Gateway>();

  return {
    ...original,
    canonicalizeModelId: (id: string) =>
      id === 'openai/gpt-5-alias' ? 'openai/gpt-5' : original.canonicalizeModelId(id),
  };
});

const { resolveModelReasoning } = await import('../../../../packages/frogbot/src/ai/reasoning.js');

const config = {
  providers: {
    openai: true,
    local: {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: [
        {
          id: 'thinker',
          mode: 'chat',
          reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
        },
        { id: 'plain', mode: 'chat' },
      ],
    },
  },
  routers: { smart: { model: 'openai/gpt-5-alias' } },
} as unknown as SanitizedAIConfig;

describe('resolveModelReasoning', () => {
  it('resolves routers and aliases to the canonical catalog model variants', () => {
    const canonical = resolveModelReasoning({ config, model: 'openai/gpt-5' });

    expect(canonical.length).toBeGreaterThan(0);
    expect(resolveModelReasoning({ config, model: 'openai/gpt-5-alias' })).toEqual(canonical);
    expect(resolveModelReasoning({ config, model: 'smart' })).toEqual(canonical);
  });

  it('reads custom model options from the provider declaration', () => {
    expect(resolveModelReasoning({ config, model: 'local/thinker' })).toEqual([
      { key: 'low', label: 'Low', providerOptions: { local: { reasoningEffort: 'low' } } },
      { key: 'high', label: 'High', providerOptions: { local: { reasoningEffort: 'high' } } },
    ]);
  });

  it.each(['local/plain', 'local/undeclared', 'openai/unknown', 'fast'])(
    'offers no reasoning options for %s',
    (model) => {
      expect(resolveModelReasoning({ config, model })).toEqual([]);
    },
  );
});
