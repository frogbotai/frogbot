// Vertex middleware tests — vertexThinkingBudget hook.

import { describe, expect, it } from 'vitest';

import { vertexThinkingBudget } from './middleware.js';
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
    provider: 'vertex',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

describe('vertexThinkingBudget', () => {
  it('maps reasoning_effort to google.thinkingConfig.thinkingBudget for Gemini', () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { openai: { reasoning_effort: 'high' } },
      params: { maxOutputTokens: 16384 },
    });
    vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toEqual({
      thinkingConfig: { thinkingBudget: 13107 },
    });
  });

  it('maps medium effort to 50%', () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { openai: { reasoning_effort: 'medium' } },
      params: { maxOutputTokens: 8192 },
    });
    vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toEqual({
      thinkingConfig: { thinkingBudget: 4096 },
    });
  });

  it('skips non-Gemini models', () => {
    const args = makeArgs('vertex/claude-3.5-sonnet', {
      providerOptions: { openai: { reasoning_effort: 'high' } },
    });
    vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toBeUndefined();
  });

  it('skips if google.thinkingConfig is already set', () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: {
        openai: { reasoning_effort: 'high' },
        google: { thinkingConfig: { thinkingBudget: 999 } },
      },
    });
    vertexThinkingBudget(args);
    expect((args.providerOptions['google'] as any).thinkingConfig.thinkingBudget).toBe(999);
  });

  it('skips if no reasoning_effort', () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: {},
    });
    vertexThinkingBudget(args);
    expect(args.providerOptions['google']).toBeUndefined();
  });

  it('applies minimum budget floor', () => {
    const args = makeArgs('vertex/gemini-2.0-flash', {
      providerOptions: { openai: { reasoning_effort: 'low' } },
      params: { maxOutputTokens: 2048 },
    });
    vertexThinkingBudget(args);
    // 15% of 2048 = 307, floor = 1024
    expect(args.providerOptions['google']).toEqual({
      thinkingConfig: { thinkingBudget: 1024 },
    });
  });
});
