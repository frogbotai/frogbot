// Azure canonical ID mapping tests.

import { describe, expect, it } from 'vitest';

import { AZURE_CANONICAL_IDS, resolveAzureModelId } from './canonical.js';

describe('resolveAzureModelId', () => {
  it('maps known model names', () => {
    expect(resolveAzureModelId('gpt-4o')).toBe('gpt-4o');
    expect(resolveAzureModelId('o3')).toBe('o3');
    expect(resolveAzureModelId('o4-mini')).toBe('o4-mini');
  });

  it('passes through custom deployment names unchanged', () => {
    expect(resolveAzureModelId('my-custom-deployment')).toBe('my-custom-deployment');
    expect(resolveAzureModelId('production-gpt4o-v2')).toBe('production-gpt4o-v2');
  });

  it('canonical table includes o-series models', () => {
    expect(AZURE_CANONICAL_IDS['o1']).toBe('o1');
    expect(AZURE_CANONICAL_IDS['o3-mini']).toBe('o3-mini');
  });
});
