// Bedrock middleware tests — bedrockCachePoint hook.

import { describe, expect, it } from 'vitest';

import { bedrockCachePoint } from './middleware.js';
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
    bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toEqual({
      cachePoint: { type: 'default' },
    });
    expect(args.providerOptions['unknown']!['cache_control']).toBeUndefined();
  });

  it('fires for models containing "claude" in the ID', () => {
    const args = makeArgs('claude-4-sonnet', {
      providerOptions: {
        unknown: { cache_control: { type: 'ephemeral' } },
      },
    });
    bedrockCachePoint(args);
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
    bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });

  it('skips when no cache_control in unknown namespace', () => {
    const args = makeArgs('anthropic.claude-3-5-sonnet-20241022-v2:0', {
      providerOptions: { unknown: { some_other: 'value' } },
    });
    bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });

  it('skips when no providerOptions', () => {
    const args = makeArgs('anthropic.claude-3-5-sonnet-20241022-v2:0', { providerOptions: {} });
    bedrockCachePoint(args);
    expect(args.providerOptions['bedrock']).toBeUndefined();
  });
});
