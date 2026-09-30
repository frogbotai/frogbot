import { describe, expect, it } from 'vitest';

import {
  createApiKeyToken,
  extractApiKeyToken,
  getApiKeyPrefix,
  hashApiKeyToken,
} from '../../../../packages/plugins/plugin-api-keys/src/server/token.js';

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
    const token = createApiKeyToken();

    expect(extractApiKeyToken(new Headers({ authorization: `bearer ${token}` }))).toBe(token);
  });

  it('extracts default and configured key headers', () => {
    const token = createApiKeyToken();
    const custom = createApiKeyToken({ tokenPrefix: 'acme' });

    expect(extractApiKeyToken(new Headers({ 'x-api-key': token }))).toBe(token);
    expect(
      extractApiKeyToken(new Headers({ 'x-service-key': custom }), {
        headerNames: ['x-service-key'],
        tokenPrefix: 'acme',
      }),
    ).toBe(custom);
  });

  it('prefers a Bearer key over key headers', () => {
    const bearer = createApiKeyToken();
    const header = createApiKeyToken();

    expect(
      extractApiKeyToken(new Headers({ authorization: `Bearer ${bearer}`, 'x-api-key': header })),
    ).toBe(bearer);
  });

  it.each(['Bearer not-a-jwt', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.signature', 'JWT token'])(
    'falls back to key headers when the Authorization value %s is not a key',
    (authorization) => {
      const token = createApiKeyToken();

      expect(extractApiKeyToken(new Headers({ authorization, 'x-api-key': token }))).toBe(token);
    },
  );

  it.each([
    {},
    { authorization: 'Basic fb_token' },
    { authorization: 'Bearer' },
    { authorization: 'Bearer fb_token' },
    { authorization: `Bearer ${createApiKeyToken({ tokenPrefix: 'acme' })}` },
    { 'x-api-key': 'fb one' },
    { 'x-other-key': createApiKeyToken() },
  ])('rejects missing or malformed values', (values) => {
    expect(extractApiKeyToken(new Headers(values))).toBeNull();
  });
});
