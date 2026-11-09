import { timingSafeEqual } from 'node:crypto';

import { Secret, TOTP } from 'otpauth';

const PERIOD = 30;

const totpFor = (secret: string, label = '', issuer = '') =>
  new TOTP({
    issuer,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });

/** Compares two strings in constant time for their length; strings of different lengths never match. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

/** A new random 160-bit TOTP secret, base32 encoded. */
export function createTOTPSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** The `otpauth://` URI an authenticator app reads from the QR code. */
export function totpURI({
  secret,
  label,
  issuer,
}: {
  secret: string;
  label: string;
  issuer: string;
}): string {
  return totpFor(secret, label, issuer).toString();
}

/** The 30-second time step that `timestamp` falls in. */
export function totpStep(timestamp = Date.now()): number {
  return Math.floor(timestamp / 1000 / PERIOD);
}

/**
 * Checks a 6-digit code against the steps one before and one after `timestamp` (RFC 6238, SHA-1,
 * 30 s) and returns the matching step, or `null`. A step at or below `lastStep` is refused, so a
 * code works once.
 */
export function verifyTOTP({
  secret,
  code,
  lastStep,
  timestamp = Date.now(),
}: {
  secret: string;
  code: string;
  lastStep?: number | null;
  timestamp?: number;
}): number | null {
  if (!/^\d{6}$/.test(code)) return null;

  const totp = totpFor(secret);
  const current = totpStep(timestamp);
  let matched: number | null = null;

  for (const step of [current - 1, current, current + 1]) {
    const expected = totp.generate({ timestamp: step * PERIOD * 1000 });

    if (constantTimeEqual(expected, code) && matched === null) matched = step;
  }

  return matched !== null && (lastStep === null || lastStep === undefined || matched > lastStep)
    ? matched
    : null;
}
