import { describe, expect, it } from 'vitest';

import type { BeforeUpstreamHookArgs } from '../../../../../packages/gateway/src/hooks.js';
import { claudeThinkingEffort } from '../../../../../packages/gateway/src/providers/anthropic/middleware.js';

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
    provider: 'anthropic',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

describe('claudeThinkingEffort', () => {
  it('maps reasoning_effort high → thinking.budget_tokens for Claude', async () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
      params: { maxOutputTokens: 16384 },
    });

    await claudeThinkingEffort(args);

    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 13107 },
    });
  });

  it('maps reasoning_effort medium → ~50% of maxOutputTokens', async () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'medium' } },
      params: { maxOutputTokens: 10000 },
    });

    await claudeThinkingEffort(args);

    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 5000 },
    });
  });

  it('applies minimum budget floor of 1024', async () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'low' } },
      params: { maxOutputTokens: 2048 },
    });

    await claudeThinkingEffort(args);

    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 1024 },
    });
  });

  it('uses default maxOutputTokens when not specified', async () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
      params: {},
    });

    await claudeThinkingEffort(args);

    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 13107 },
    });
  });

  it('skips non-Claude models', async () => {
    const args = makeArgs('openai/gpt-4o', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
    });

    await claudeThinkingEffort(args);

    expect(args.providerOptions['anthropic']).toBeUndefined();
  });

  it('skips if anthropic.thinking is already explicitly set', async () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: {
        unknown: { reasoning_effort: 'high' },
        anthropic: { thinking: { type: 'enabled', budget_tokens: 999 } },
      },
    });

    await claudeThinkingEffort(args);

    expect((args.providerOptions['anthropic'] as any).thinking.budget_tokens).toBe(999);
  });

  it('skips if no reasoning_effort provided', async () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { openai: {} },
    });

    await claudeThinkingEffort(args);

    expect(args.providerOptions['anthropic']).toBeUndefined();
  });

  it('returns 0 for effort "none"', async () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'none' } },
    });

    await claudeThinkingEffort(args);

    expect(args.providerOptions['anthropic']).toBeUndefined();
  });
});
