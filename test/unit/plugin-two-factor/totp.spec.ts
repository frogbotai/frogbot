import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  createTOTPSecret,
  totpStep,
  totpURI,
  verifyTOTP,
} from '../../../packages/plugins/plugin-two-factor/src/totp.js';

const now = Date.UTC(2026, 10, 9, 12, 0, 15);

const codeAt = (secret: string, timestamp: number) =>
  new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate({ timestamp });

describe('two-factor TOTP', () => {
  const secret = createTOTPSecret();
  const step = totpStep(now);

  it('makes 160-bit base32 secrets and an otpauth URI with the issuer and account', () => {
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(createTOTPSecret()).not.toBe(secret);

    const uri = new URL(totpURI({ secret, label: 'priya@example.com', issuer: 'Acme' }));

    expect(uri.protocol).toBe('otpauth:');
    expect(uri.searchParams.get('secret')).toBe(secret);
    expect(uri.searchParams.get('issuer')).toBe('Acme');
    expect(uri.searchParams.get('period')).toBe('30');
    expect(decodeURIComponent(uri.pathname)).toContain('priya@example.com');
  });

  it('accepts the current step and one step of drift either way, and nothing further', () => {
    expect(verifyTOTP({ secret, code: codeAt(secret, now), timestamp: now })).toBe(step);
    expect(verifyTOTP({ secret, code: codeAt(secret, now - 30_000), timestamp: now })).toBe(
      step - 1,
    );
    expect(verifyTOTP({ secret, code: codeAt(secret, now + 30_000), timestamp: now })).toBe(
      step + 1,
    );
    expect(verifyTOTP({ secret, code: codeAt(secret, now - 60_000), timestamp: now })).toBeNull();
    expect(verifyTOTP({ secret, code: codeAt(secret, now + 60_000), timestamp: now })).toBeNull();
  });

  it('refuses a code whose step is at or below the last accepted one', () => {
    const code = codeAt(secret, now);

    expect(verifyTOTP({ secret, code, lastStep: step - 1, timestamp: now })).toBe(step);
    expect(verifyTOTP({ secret, code, lastStep: step, timestamp: now })).toBeNull();
    expect(
      verifyTOTP({ secret, code: codeAt(secret, now - 30_000), lastStep: step, timestamp: now }),
    ).toBeNull();
    expect(
      verifyTOTP({ secret, code: codeAt(secret, now + 30_000), lastStep: step, timestamp: now }),
    ).toBe(step + 1);
  });

  it('refuses malformed codes and codes for another secret', () => {
    const code = codeAt(secret, now);

    expect(verifyTOTP({ secret, code: ` ${code}`, timestamp: now })).toBeNull();
    expect(verifyTOTP({ secret, code: code.slice(1), timestamp: now })).toBeNull();
    expect(verifyTOTP({ secret, code: 'abcdef', timestamp: now })).toBeNull();
    expect(
      verifyTOTP({
        secret: 'GEZDGNBVGY3TQOJQ',
        code: codeAt('JBSWY3DPEHPK3PXP', now),
        timestamp: now,
      }),
    ).toBeNull();
  });

  it('never matches strings of different lengths', () => {
    expect(constantTimeEqual('123456', '123456')).toBe(true);
    expect(constantTimeEqual('123456', '123457')).toBe(false);
    expect(constantTimeEqual('123456', '1234567')).toBe(false);
  });
});
