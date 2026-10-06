// Vertex middleware tests — vertexThinkingBudget hook.

import { describe, expect, it } from 'vitest';

import type { BeforeUpstreamHookArgs } from '../../../../../packages/gateway/src/hooks.js';
import { vertexThinkingBudget } from '../../../../../packages/gateway/src/providers/vertex/middleware.js';

function makeArgs(
  model: string,
  overrides: Partial<BeforeUpstreamHookArgs> = {},
): BeforeUpstreamHookArgs {
  return {
    phase: 'beforeUpstream',
    operation: 'chat.completions',
    requestId: 'test-req',
    startedAt: Date.now(),
    context: {},
    otel: {},
    model,
    provider: 'vertex',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

describe('vertexThinkingBudget', () => {
  it('maps reasoning_effort to google.thinkingConfig.thinkingBudget for Gemini', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
      params: { maxOutputTokens: 16384 },
    });
    await vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toEqual({
      thinkingConfig: { thinkingBudget: 13107 },
    });
  });

  it('maps medium effort to 50%', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { unknown: { reasoning_effort: 'medium' } },
      params: { maxOutputTokens: 8192 },
    });
    await vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toEqual({
      thinkingConfig: { thinkingBudget: 4096 },
    });
  });

  it('skips non-Gemini models', async () => {
    const args = makeArgs('vertex/claude-3.5-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
    });
    await vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toBeUndefined();
  });

  it('skips if google.thinkingConfig is already set', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: {
        unknown: { reasoning_effort: 'high' },
        google: { thinkingConfig: { thinkingBudget: 999 } },
      },
    });
    await vertexThinkingBudget(args);
    expect((args.providerOptions['google'] as any).thinkingConfig.thinkingBudget).toBe(999);
  });

  it('skips if no reasoning_effort', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: {},
    });
    await vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toBeUndefined();
  });

  it('applies minimum budget floor', async () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { unknown: { reasoning_effort: 'low' } },
      params: { maxOutputTokens: 2048 },
    });
    await vertexThinkingBudget(args);
    // 15% of 2048 = 307, floor = 1024
    expect(args.providerOptions['google']).toEqual({
      thinkingConfig: { thinkingBudget: 1024 },
    });
  });
});
