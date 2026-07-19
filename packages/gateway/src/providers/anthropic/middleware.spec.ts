// Anthropic middleware tests — claudeThinkingEffort hook.

import { describe, expect, it } from 'vitest';

import { claudeThinkingEffort } from './middleware.js';
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
    provider: 'anthropic',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

describe('claudeThinkingEffort', () => {
  it('maps reasoning_effort high → thinking.budget_tokens for Claude', () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { openai: { reasoning_effort: 'high' } },
      params: { maxOutputTokens: 16384 },
    });
    claudeThinkingEffort(args);
    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 13107 },
    });
  });

  it('maps reasoning_effort medium → ~50% of maxOutputTokens', () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { openai: { reasoning_effort: 'medium' } },
      params: { maxOutputTokens: 10000 },
    });
    claudeThinkingEffort(args);
    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 5000 },
    });
  });

  it('applies minimum budget floor of 1024', () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { openai: { reasoning_effort: 'low' } },
      params: { maxOutputTokens: 2048 },
    });
    claudeThinkingEffort(args);
    // 15% of 2048 = 307, clamped to 1024
    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 1024 },
    });
  });

  it('uses default maxOutputTokens when not specified', () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { openai: { reasoning_effort: 'high' } },
      params: {},
    });
    claudeThinkingEffort(args);
    // 80% of default 16384 = 13107
    expect(args.providerOptions['anthropic']).toEqual({
      thinking: { type: 'enabled', budgetTokens: 13107 },
    });
  });

  it('skips non-Claude models', () => {
    const args = makeArgs('openai/gpt-4o', {
      providerOptions: { openai: { reasoning_effort: 'high' } },
    });
    claudeThinkingEffort(args);
    expect(args.providerOptions['anthropic']).toBeUndefined();
  });

  it('skips if anthropic.thinking is already explicitly set', () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: {
        openai: { reasoning_effort: 'high' },
        anthropic: { thinking: { type: 'enabled', budget_tokens: 999 } },
      },
    });
    claudeThinkingEffort(args);
    // Should NOT overwrite
    expect((args.providerOptions['anthropic'] as any).thinking.budget_tokens).toBe(999);
  });

  it('skips if no reasoning_effort provided', () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { openai: {} },
    });
    claudeThinkingEffort(args);
    expect(args.providerOptions['anthropic']).toBeUndefined();
  });

  it('returns 0 for effort "none"', () => {
    const args = makeArgs('anthropic/claude-4-sonnet', {
      providerOptions: { openai: { reasoning_effort: 'none' } },
    });
    claudeThinkingEffort(args);
    // budget = 0, so hook returns early
    expect(args.providerOptions['anthropic']).toBeUndefined();
  });
});
