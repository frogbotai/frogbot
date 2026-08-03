import { describe, expect, it } from 'vitest';

import {
  createApiKeyToken,
  extractApiKeyToken,
  getApiKeyPrefix,
  hashApiKeyToken,
} from './token.js';

describe('API key token utilities', () => {
  it('creates unique URL-safe tokens with the configured prefix', () => {
    const first = createApiKeyToken({ tokenPrefix: 'acme' });
    const second = createApiKeyToken({ tokenPrefix: 'acme' });
    expect(first).toMatch(/^acme_[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it('uses the native FrogBot prefix by default', () => {
    expect(createApiKeyToken()).toMatch(/^fb_[A-Za-z0-9_-]{43}$/);
  });

  it('hashes tokens deterministically without retaining plaintext', () => {
    const hash = hashApiKeyToken('fbt_secret');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKeyToken('fbt_secret')).toBe(hash);
    expect(hash).not.toContain('secret');
  });

  it('returns a stable display prefix', () => {
    expect(getApiKeyPrefix('fbt_1234567890abcdef')).toBe('fbt_12345678');
  });

  it('extracts Bearer tokens case-insensitively', () => {
    expect(extractApiKeyToken(new Headers({ authorization: 'bearer fbt_token' }))).toBe('fbt_token');
  });

  it('extracts default and configured key headers', () => {
    expect(extractApiKeyToken(new Headers({ 'x-api-key': 'fbt_default' }))).toBe('fbt_default');
    expect(
      extractApiKeyToken(new Headers({ 'x-service-key': 'fbt_custom' }), {
        headerNames: ['x-service-key'],
      }),
    ).toBe('fbt_custom');
  });

  it.each([
    {},
    { authorization: 'Basic fbt_token' },
    { authorization: 'Bearer' },
    { authorization: 'Bearer fbt one' },
    { 'x-api-key': 'fbt one' },
  ])('rejects missing or malformed values', (values) => {
    expect(extractApiKeyToken(new Headers(values))).toBeNull();
  });
});
