// OpenAI middleware tests — openaiReasoningEffort hook.

import { describe, expect, it } from 'vitest';

import { openaiEmbedDimensions, openaiReasoningEffort } from './middleware.js';
import type { BeforeUpstreamHookArgs } from '../../hooks.js';

function makeArgs(model: string, overrides: Partial<BeforeUpstreamHookArgs> = {}): BeforeUpstreamHookArgs {
  return {
    phase: 'beforeUpstream',
    operation: 'chat.completions',
    requestId: 'test-req',
    startedAt: Date.now(),
    context: {},
    otel: {},
    model,
    provider: 'openai',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

describe('openaiReasoningEffort', () => {
  it('maps Anthropic thinking budget to reasoning_effort for o-series', () => {
    const args = makeArgs('openai/o3', {
      providerOptions: { anthropic: { thinking: { budget_tokens: 13000 } } },
      params: { maxOutputTokens: 16384 },
    });
    openaiReasoningEffort(args);
    // 13000/16384 ≈ 0.79 → 'high'
    expect(args.providerOptions['openai']).toEqual({ reasoningEffort: 'high' });
  });

  it('maps low budget to minimal', () => {
    const args = makeArgs('openai/o1', {
      providerOptions: { anthropic: { thinking: { budget_tokens: 500 } } },
      params: { maxOutputTokens: 16384 },
    });
    openaiReasoningEffort(args);
    // 500/16384 ≈ 0.03 → 'minimal'
    expect(args.providerOptions['openai']).toEqual({ reasoningEffort: 'minimal' });
  });

  it('caps near-full budget at xhigh (OpenAI enum has no "max")', () => {
    const args = makeArgs('openai/o4-mini', {
      providerOptions: { anthropic: { thinking: { budget_tokens: 16000 } } },
      params: { maxOutputTokens: 16384 },
    });
    openaiReasoningEffort(args);
    // 16000/16384 ≈ 0.98 → clamped to 'xhigh'
    expect(args.providerOptions['openai']).toEqual({ reasoningEffort: 'xhigh' });
  });

  it('skips non-reasoning models (gpt-4o)', () => {
    const args = makeArgs('openai/gpt-4o', {
      providerOptions: { anthropic: { thinking: { budget_tokens: 13000 } } },
    });
    openaiReasoningEffort(args);
    expect(args.providerOptions['openai']).toBeUndefined();
  });

  it('skips if reasoningEffort already explicitly set', () => {
    const args = makeArgs('openai/o3', {
      providerOptions: {
        openai: { reasoningEffort: 'low' },
        anthropic: { thinking: { budget_tokens: 13000 } },
      },
    });
    openaiReasoningEffort(args);
    // Should NOT overwrite
    expect((args.providerOptions['openai'] as any).reasoningEffort).toBe('low');
  });

  it('skips if no Anthropic thinking budget', () => {
    const args = makeArgs('openai/o3', {
      providerOptions: { anthropic: {} },
    });
    openaiReasoningEffort(args);
    expect(args.providerOptions['openai']).toBeUndefined();
  });

  it('skips if budget_tokens is 0', () => {
    const args = makeArgs('openai/o3', {
      providerOptions: { anthropic: { thinking: { budget_tokens: 0 } } },
    });
    openaiReasoningEffort(args);
    expect(args.providerOptions['openai']).toBeUndefined();
  });

  it('recognizes o1, o3, o4 prefixes as reasoning models', () => {
    const models = ['openai/o1', 'openai/o1-mini', 'openai/o3', 'openai/o3-mini', 'openai/o4-mini'];
    for (const model of models) {
      const args = makeArgs(model, {
        providerOptions: { anthropic: { thinking: { budget_tokens: 8000 } } },
        params: { maxOutputTokens: 16384 },
      });
      openaiReasoningEffort(args);
      expect(args.providerOptions['openai']).toBeDefined();
    }
  });
});

describe('openaiEmbedDimensions', () => {
  it('re-homes neutral dimensions and user into the openai namespace', () => {
    const args = makeArgs('openai/text-embedding-3-small', {
      operation: 'embeddings',
      providerOptions: { unknown: { dimensions: 256, user: 'user-1' } },
    });

    openaiEmbedDimensions(args);

    expect(args.providerOptions.openai).toEqual({ dimensions: 256, user: 'user-1' });
    expect(args.providerOptions.unknown).toEqual({});
  });
});
