// Bedrock middleware tests — bedrockCachePoint hook.

import { describe, expect, it } from 'vitest';

import { bedrockCachePoint, bedrockThinkingEffort } from './middleware.js';
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
    provider: 'amazon-bedrock',
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
    ...overrides,
  };
}

describe('bedrockCachePoint', () => {
  it('converts cache_control to cachePoint for Claude on Bedrock', () => {
    const args = makeArgs('anthropic.claude-3-5-sonnet-20241022-v2:0', {
      providerOptions: {
        unknown: { cache_control: { type: 'ephemeral' } },
      },
    });
    void bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toEqual({
      cachePoint: { type: 'default' },
    });
    expect(args.providerOptions['unknown']['cache_control']).toBeUndefined();
  });

  it('fires for models containing "claude" in the ID', () => {
    const args = makeArgs('claude-4-sonnet', {
      providerOptions: {
        unknown: { cache_control: { type: 'ephemeral' } },
      },
    });
    void bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toEqual({
      cachePoint: { type: 'default' },
    });
  });

  it('skips non-Anthropic models', () => {
    const args = makeArgs('amazon.nova-pro-v1:0', {
      providerOptions: {
        unknown: { cache_control: { type: 'ephemeral' } },
      },
    });
    void bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });

  it('skips when no cache_control in unknown namespace', () => {
    const args = makeArgs('anthropic.claude-3-5-sonnet-20241022-v2:0', {
      providerOptions: { unknown: { some_other: 'value' } },
    });
    void bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });

  it('skips when no providerOptions', () => {
    const args = makeArgs('anthropic.claude-3-5-sonnet-20241022-v2:0', { providerOptions: {} });
    void bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });
});

describe('bedrockThinkingEffort', () => {
  it('translates reasoning_effort to reasoningConfig for Claude on Bedrock', () => {
    const args = makeArgs('anthropic.claude-sonnet-4-20250514-v1:0', {
      params: { maxOutputTokens: 10000 },
      providerOptions: { unknown: { reasoning_effort: 'high' } },
    });
    void bedrockThinkingEffort(args);
    expect(args.providerOptions['bedrock']).toEqual({
      reasoningConfig: { type: 'enabled', budgetTokens: 8000 },
    });
  });

  it('fires for alias model IDs containing "claude"', () => {
    const args = makeArgs('claude-4-sonnet', {
      params: { maxOutputTokens: 10000 },
      providerOptions: { unknown: { reasoning_effort: 'low' } },
    });
    void bedrockThinkingEffort(args);
    expect(args.providerOptions['bedrock']).toEqual({
      reasoningConfig: { type: 'enabled', budgetTokens: 1500 },
    });
  });

  it('applies the minimum budget floor', () => {
    const args = makeArgs('claude-4-sonnet', {
      params: { maxOutputTokens: 1000 },
      providerOptions: { unknown: { reasoning_effort: 'minimal' } },
    });
    void bedrockThinkingEffort(args);
    expect(args.providerOptions['bedrock']).toEqual({
      reasoningConfig: { type: 'enabled', budgetTokens: 1024 },
    });
  });

  it('skips effort "none"', () => {
    const args = makeArgs('claude-4-sonnet', {
      providerOptions: { unknown: { reasoning_effort: 'none' } },
    });
    void bedrockThinkingEffort(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });

  it('skips non-Claude models', () => {
    const args = makeArgs('amazon.nova-pro-v1:0', {
      providerOptions: { unknown: { reasoning_effort: 'high' } },
    });
    void bedrockThinkingEffort(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });

  it('does not override explicit reasoningConfig', () => {
    const args = makeArgs('claude-4-sonnet', {
      params: { maxOutputTokens: 10000 },
      providerOptions: {
        unknown: { reasoning_effort: 'high' },
        bedrock: { reasoningConfig: { type: 'enabled', budgetTokens: 2048 } },
      },
    });
    void bedrockThinkingEffort(args);
    expect(args.providerOptions['bedrock']).toEqual({
      reasoningConfig: { type: 'enabled', budgetTokens: 2048 },
    });
  });

  it('skips when no reasoning_effort present', () => {
    const args = makeArgs('claude-4-sonnet', {
      providerOptions: { unknown: { some_other: 'value' } },
    });
    void bedrockThinkingEffort(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });
});
