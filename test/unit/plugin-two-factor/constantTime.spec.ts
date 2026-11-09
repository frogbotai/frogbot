import type * as Crypto from 'node:crypto';

import { Secret, TOTP } from 'otpauth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const compare = vi.hoisted(() => ({ calls: 0 }));

vi.mock('node:crypto', async (importOriginal) => {
  const crypto = await importOriginal<typeof Crypto>();

  return {
    ...crypto,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      compare.calls += 1;

      return crypto.timingSafeEqual(a, b);
    },
  };
});

const { createRecoveryCodes, spendRecoveryCode } =
  await import('../../../packages/plugins/plugin-two-factor/src/recovery.js');

const { verifyTOTP } = await import('../../../packages/plugins/plugin-two-factor/src/totp.js');

describe('two-factor compares in constant time', () => {
  beforeEach(() => {
    compare.calls = 0;
  });

  it('compares a TOTP code with all three steps through timingSafeEqual, even after a match', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = Date.UTC(2026, 10, 9, 12, 0, 15);
    const code = new TOTP({ secret: Secret.fromBase32(secret) }).generate({
      timestamp: now - 30_000,
    });

    expect(verifyTOTP({ secret, code, timestamp: now })).not.toBeNull();
    expect(compare.calls).toBe(3);
  });

  it('compares a recovery code with every stored hash through timingSafeEqual, even after a match', () => {
    const { codes, hashes } = createRecoveryCodes();
    compare.calls = 0;

    expect(spendRecoveryCode({ code: codes[0], hashes })).toHaveLength(9);
    expect(compare.calls).toBe(10);
  });
});
