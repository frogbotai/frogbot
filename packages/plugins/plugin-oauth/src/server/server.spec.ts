import { describe, expect, it } from 'vitest';

import {
  createOAuthEncryption,
  createOAuthState,
  createOAuthStateExpiration,
  createPKCECodes,
  isOAuthStateExpired,
  mergeOAuthTokenSets,
  OAuthCryptoError,
  parseOAuthTokenSet,
} from '../server.js';

describe('OAuth server primitives', () => {
  it('generates random URL-safe state values', () => {
    const first = createOAuthState();
    const second = createOAuthState();
    expect(first).toMatch(/^[\w-]{43}$/);
    expect(first).not.toBe(second);
  });

  it('calculates and validates state expiration', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = createOAuthStateExpiration({ now, ttlMs: 1000 });
    expect(expiresAt.toISOString()).toBe('2026-01-01T00:00:01.000Z');
    expect(isOAuthStateExpired({ expiresAt, now })).toBe(false);
    expect(isOAuthStateExpired({ expiresAt, now: expiresAt })).toBe(true);
  });

  it('matches the RFC 7636 S256 vector', () => {
    const codes = createPKCECodes({ verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk' });
    expect(codes.challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('encrypts values and rejects tampering', async () => {
    const encryption = createOAuthEncryption({ secret: 'secret' });
    const encrypted = await encryption.encrypt('credentials');
    expect(encrypted).not.toContain('credentials');
    expect(await encryption.decrypt(encrypted)).toBe('credentials');
    const parts = encrypted.split('.');
    parts[2] = `${parts[2]?.startsWith('A') ? 'B' : 'A'}${parts[2]?.slice(1)}`;
    expect(() => encryption.decrypt(parts.join('.'))).toThrow(OAuthCryptoError);
  });

  it('normalizes and merges token responses without dropping refresh tokens', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const current = parseOAuthTokenSet({
      now,
      value: { access_token: 'first', refresh_token: 'refresh', expires_in: 60, scope: 'openid email' },
    });
    const merged = mergeOAuthTokenSets({ current, next: { accessToken: 'second' } });
    expect(current.expiresAt?.toISOString()).toBe('2026-01-01T00:01:00.000Z');
    expect(current.scopes).toEqual(['openid', 'email']);
    expect(merged).toMatchObject({ accessToken: 'second', refreshToken: 'refresh' });
  });
});
