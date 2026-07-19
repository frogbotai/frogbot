// Anthropic-AWS canonical ID mapping tests.

import { describe, expect, it } from 'vitest';

import { ANTHROPIC_AWS_CANONICAL_IDS, resolveAnthropicAwsModelId } from './canonical.js';

describe('resolveAnthropicAwsModelId', () => {
  it('maps Claude shorthands to native Anthropic model IDs', () => {
    expect(resolveAnthropicAwsModelId('claude-3.5-sonnet')).toBe('claude-3-5-sonnet-20241022');
    expect(resolveAnthropicAwsModelId('claude-4-opus')).toBe('claude-opus-4-20250514');
  });

  it('passes through full IDs unchanged', () => {
    const fullId = 'claude-3-opus-20240229';
    expect(resolveAnthropicAwsModelId(fullId)).toBe(fullId);
  });

  it('never emits Bedrock ARN-style IDs (wrong wire format for anthropic-aws)', () => {
    // G40: the provider speaks the native Anthropic Messages API, so Bedrock
    // IDs like `anthropic.claude-...-v2:0` would 404 upstream.
    for (const value of Object.values(ANTHROPIC_AWS_CANONICAL_IDS)) {
      expect(value).not.toMatch(/^anthropic\./);
      expect(value).not.toMatch(/:\d+$/);
    }
  });

  it('only contains Claude models', () => {
    for (const key of Object.keys(ANTHROPIC_AWS_CANONICAL_IDS)) {
      expect(key).toMatch(/claude/);
    }
  });

  it('has 7 shorthand entries', () => {
    expect(Object.keys(ANTHROPIC_AWS_CANONICAL_IDS).length).toBe(7);
  });
});
