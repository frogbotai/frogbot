// Bedrock canonical ID mapping tests.

import { describe, expect, it } from 'vitest';

import { BEDROCK_CANONICAL_IDS, resolveBedrockModelId } from './canonical.js';

describe('resolveBedrockModelId', () => {
  it('maps shorthand Claude IDs to full ARN-style IDs', () => {
    expect(resolveBedrockModelId('claude-3.5-sonnet')).toBe(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
    expect(resolveBedrockModelId('claude-4-sonnet')).toBe(
      'anthropic.claude-sonnet-4-20250514-v1:0',
    );
    expect(resolveBedrockModelId('claude-4-opus')).toBe(
      'anthropic.claude-opus-4-20250514-v1:0',
    );
  });

  it('maps Nova model shorthands', () => {
    expect(resolveBedrockModelId('nova-pro')).toBe('amazon.nova-pro-v1:0');
    expect(resolveBedrockModelId('nova-lite')).toBe('amazon.nova-lite-v1:0');
    expect(resolveBedrockModelId('nova-micro')).toBe('amazon.nova-micro-v1:0');
  });

  it('maps Llama model shorthands', () => {
    expect(resolveBedrockModelId('llama-3.3-70b')).toBe(
      'meta.llama3-3-70b-instruct-v1:0',
    );
    expect(resolveBedrockModelId('llama-3.2-3b')).toBe(
      'meta.llama3-2-3b-instruct-v1:0',
    );
  });

  it('passes through full IDs unchanged', () => {
    const fullId = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    expect(resolveBedrockModelId(fullId)).toBe(fullId);
  });

  it('passes through unknown shorthand IDs unchanged', () => {
    expect(resolveBedrockModelId('some-custom-model')).toBe('some-custom-model');
  });

  it('canonical table has expected count', () => {
    expect(Object.keys(BEDROCK_CANONICAL_IDS).length).toBeGreaterThanOrEqual(16);
  });
});
