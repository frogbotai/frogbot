import { describe, expect, test } from 'vitest';
import { stripEmptyKeys } from './stripEmptyKeys.js';

describe('stripEmptyKeys', () => {
  test('strips top-level empty-string key', () => {
    const obj = { '': {}, city: 'San Francisco' };
    const result = stripEmptyKeys(obj) as Record<string, unknown>;
    expect(result[''] ).toBeUndefined();
    expect(result.city).toBe('San Francisco');
  });

  test('does not strip nested empty-string keys', () => {
    const obj = { nested: { '': {}, country: 'US' } };
    const result = stripEmptyKeys(obj) as Record<string, unknown>;
    expect((result.nested as Record<string, unknown>)['']).toEqual({});
  });

  test('returns primitives unchanged', () => {
    expect(stripEmptyKeys(null)).toBeNull();
    expect(stripEmptyKeys(undefined)).toBeUndefined();
    expect(stripEmptyKeys(42)).toBe(42);
    expect(stripEmptyKeys('hello')).toBe('hello');
  });

  test('returns arrays unchanged', () => {
    const arr = [1, 2, 3];
    expect(stripEmptyKeys(arr)).toBe(arr);
  });
});
