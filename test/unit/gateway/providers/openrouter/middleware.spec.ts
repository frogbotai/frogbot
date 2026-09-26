import { describe, expect, it } from 'vitest';

import type { BeforeUpstreamHookArgs } from '../../../../../packages/gateway/src/hooks.js';
import { openrouterReasoning } from '../../../../../packages/gateway/src/providers/openrouter/middleware.js';

function makeArgs(providerOptions: BeforeUpstreamHookArgs['providerOptions']) {
  return {
    phase: 'beforeUpstream',
    operation: 'chat.completions',
    requestId: 'test-req',
    startedAt: Date.now(),
    context: {},
    otel: {},
    model: 'openrouter/anthropic/claude-sonnet-4.6',
    provider: 'openrouter',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions,
  } satisfies BeforeUpstreamHookArgs;
}

describe('openrouterReasoning', () => {
  it('moves chat and Responses reasoning_effort into openrouter.reasoning.effort', () => {
    const args = makeArgs({ unknown: { reasoning_effort: 'high', cache_control: { type: 'x' } } });

    void openrouterReasoning(args);

    expect(args.providerOptions).toEqual({
      unknown: { cache_control: { type: 'x' } },
      openrouter: { reasoning: { effort: 'high' } },
    });
  });

  it('maps effort max to xhigh and drops efforts OpenRouter does not accept', () => {
    const max = makeArgs({ unknown: { reasoning_effort: 'MAX' } });
    const bogus = makeArgs({ unknown: { reasoning_effort: 'extreme' } });

    void openrouterReasoning(max);
    void openrouterReasoning(bogus);

    expect(max.providerOptions.openrouter).toEqual({ reasoning: { effort: 'xhigh' } });
    expect(bogus.providerOptions).toEqual({ unknown: {} });
  });

  it('moves a Messages thinking budget into openrouter.reasoning.max_tokens', () => {
    const args = makeArgs({ anthropic: { thinking: { type: 'enabled', budgetTokens: 2048 } } });

    void openrouterReasoning(args);

    expect(args.providerOptions).toEqual({ openrouter: { reasoning: { max_tokens: 2048 } } });
  });

  it('maps disabled thinking to effort none and budgetless thinking to enabled', () => {
    const disabled = makeArgs({ anthropic: { thinking: { type: 'disabled' } } });
    const adaptive = makeArgs({ anthropic: { thinking: { type: 'adaptive' } } });

    void openrouterReasoning(disabled);
    void openrouterReasoning(adaptive);

    expect(disabled.providerOptions).toEqual({ openrouter: { reasoning: { effort: 'none' } } });
    expect(adaptive.providerOptions).toEqual({
      openrouter: { reasoning: { enabled: true, effort: 'medium' } },
    });
  });

  it('keeps other anthropic options while removing the unread thinking key', () => {
    const args = makeArgs({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 }, cacheControl: { type: 'x' } },
    });

    void openrouterReasoning(args);

    expect(args.providerOptions.anthropic).toEqual({ cacheControl: { type: 'x' } });
  });

  it('lets an explicit openrouter.reasoning win and still removes the translated sources', () => {
    const args = makeArgs({
      unknown: { reasoning_effort: 'low' },
      anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 } },
      openrouter: { reasoning: { effort: 'high', exclude: true }, models: ['a/b'] },
    });

    void openrouterReasoning(args);

    expect(args.providerOptions).toEqual({
      unknown: {},
      openrouter: { reasoning: { effort: 'high', exclude: true }, models: ['a/b'] },
    });
  });

  it('lets a native chat reasoning body field win over reasoning_effort', () => {
    const args = makeArgs({
      unknown: { reasoning_effort: 'low', reasoning: { max_tokens: 4096 } },
    });

    void openrouterReasoning(args);

    expect(args.providerOptions).toEqual({ unknown: { reasoning: { max_tokens: 4096 } } });
  });

  it('preserves existing openrouter routing options when adding reasoning', () => {
    const args = makeArgs({
      unknown: { reasoning_effort: 'medium' },
      openrouter: { provider: { order: ['anthropic'] } },
    });

    void openrouterReasoning(args);

    expect(args.providerOptions.openrouter).toEqual({
      provider: { order: ['anthropic'] },
      reasoning: { effort: 'medium' },
    });
  });

  it('leaves requests without reasoning untouched', () => {
    const args = makeArgs({ unknown: { user: 'u1' } });

    void openrouterReasoning(args);

    expect(args.providerOptions).toEqual({ unknown: { user: 'u1' } });
  });
});
