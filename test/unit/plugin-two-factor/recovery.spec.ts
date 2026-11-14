import { describe, expect, it } from 'vitest';

import {
  createRecoveryCodes,
  hashRecoveryCode,
  spendRecoveryCode,
} from '../../../packages/plugins/plugin-two-factor/src/recovery.js';

describe('two-factor recovery codes', () => {
  it('makes ten distinct codes and stores only their SHA-256 hashes', () => {
    const { codes, hashes } = createRecoveryCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(code))).toBe(true);
    expect(hashes).toEqual(codes.map(hashRecoveryCode));
    expect(hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true);
    expect(hashes.some((hash, index) => hash.includes(codes[index]))).toBe(false);
  });

  it('accepts a code once, ignoring case, spaces and dashes', () => {
    const { codes, hashes } = createRecoveryCodes();

    const remaining = spendRecoveryCode({
      code: ` ${codes[3].toUpperCase().replace('-', '')} `,
      hashes,
    });

    expect(remaining).toEqual(hashes.filter((_, index) => index !== 3));
    expect(spendRecoveryCode({ code: codes[3], hashes: remaining! })).toBeNull();
    expect(spendRecoveryCode({ code: codes[4], hashes: remaining! })).toHaveLength(8);
  });

  it('voids the old set when new codes replace it', () => {
    const old = createRecoveryCodes();
    const replaced = createRecoveryCodes();

    expect(old.codes.some((code) => spendRecoveryCode({ code, hashes: replaced.hashes }))).toBe(
      false,
    );
    expect(spendRecoveryCode({ code: replaced.codes[0], hashes: replaced.hashes })).toHaveLength(9);
  });

  it('refuses codes of the wrong length and unknown codes', () => {
    const { hashes } = createRecoveryCodes();

    expect(spendRecoveryCode({ code: '123456', hashes })).toBeNull();
    expect(spendRecoveryCode({ code: 'aaaaa-aaaaa', hashes })).toBeNull();
    expect(spendRecoveryCode({ code: '', hashes: [] })).toBeNull();
  });
});
