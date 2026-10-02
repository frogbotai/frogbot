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
        { id: 'reasoner', mode: 'chat', reasoning: true },
        {
          id: 'tuned',
          mode: 'chat',
          reasoning: true,
          reasoningOptions: [{ type: 'effort', values: ['high'] }],
        },
        {
          id: 'muted',
          mode: 'chat',
          reasoning: false,
          reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
        },
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

  it('offers Low, Medium and High for a custom model with reasoning: true', () => {
    expect(resolveModelReasoning({ config, model: 'local/reasoner' })).toEqual([
      { key: 'low', label: 'Low', providerOptions: { local: { reasoningEffort: 'low' } } },
      { key: 'medium', label: 'Medium', providerOptions: { local: { reasoningEffort: 'medium' } } },
      { key: 'high', label: 'High', providerOptions: { local: { reasoningEffort: 'high' } } },
    ]);
  });

  it('keeps declared options for a custom model with reasoning: true', () => {
    expect(resolveModelReasoning({ config, model: 'local/tuned' })).toEqual([
      { key: 'high', label: 'High', providerOptions: { local: { reasoningEffort: 'high' } } },
    ]);
  });

  it('offers no levels for a custom model with reasoning: false, even with declared options', () => {
    expect(resolveModelReasoning({ config, model: 'local/muted' })).toEqual([]);
  });

  it.each(['local/plain', 'local/undeclared', 'openai/unknown', 'fast'])(
    'offers no reasoning options for %s',
    (model) => {
      expect(resolveModelReasoning({ config, model })).toEqual([]);
    },
  );
});
