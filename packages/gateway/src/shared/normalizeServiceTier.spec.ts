import { describe, expect, test } from 'vitest';
import { normalizeServiceTier } from './normalizeServiceTier.js';

describe('normalizeServiceTier', () => {
  const cases = [
    { provider: 'openai', value: 'auto', expected: 'auto' },
    { provider: 'openai', value: 'flex', expected: 'flex' },
    { provider: 'openai', value: 'default', expected: 'default' },
    { provider: 'openai', value: 'scale', expected: 'scale' },
    { provider: 'groq', value: 'on_demand', expected: 'default' },
    { provider: 'groq', value: 'performance', expected: 'priority' },
    { provider: 'bedrock', value: 'reserved', expected: 'scale' },
  ] as const;

  for (const { provider, value, expected } of cases) {
    test(`normalizes ${provider} service_tier "${value}" → "${expected}"`, () => {
      const result = normalizeServiceTier({
        [provider]: { service_tier: value },
      });
      expect(result).toBe(expected);
    });
  }

  const geminiCases = [
    { trafficType: 'ON_DEMAND', expected: 'default' },
    { trafficType: 'ON_DEMAND_FLEX', expected: 'flex' },
    { trafficType: 'ON_DEMAND_PRIORITY', expected: 'priority' },
    { trafficType: 'PROVISIONED_THROUGHPUT', expected: 'scale' },
    { trafficType: 'TRAFFIC_TYPE_UNSPECIFIED', expected: 'auto' },
  ] as const;

  for (const { trafficType, expected } of geminiCases) {
    test(`normalizes Gemini trafficType "${trafficType}" → "${expected}"`, () => {
      const result = normalizeServiceTier({
        vertex: { usage_metadata: { traffic_type: trafficType } },
      });
      expect(result).toBe(expected);
    });
  }

  test('returns undefined when metadata is missing', () => {
    expect(normalizeServiceTier(undefined)).toBeUndefined();
  });

  test('returns undefined when no service_tier field exists', () => {
    expect(normalizeServiceTier({ openai: { other_field: 'value' } })).toBeUndefined();
  });
});
