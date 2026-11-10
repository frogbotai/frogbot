import { createHash, randomBytes } from 'node:crypto';

import { constantTimeEqual } from './totp.js';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

const normalize = (code: string) => code.toLowerCase().replace(/[\s-]/g, '');

/** SHA-256 of a recovery code, ignoring case, spaces and dashes. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalize(code)).digest('hex');
}

/** Ten new recovery codes such as `k7m2p-x9q4r` (50 random bits each), and their hashes. */
export function createRecoveryCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const chars = [...randomBytes(10)].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');

    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });

  return { codes, hashes: codes.map(hashRecoveryCode) };
}

/** The stored hashes left after `code` is used, or `null` when it matches none. Every hash is compared, in constant time. */
export function spendRecoveryCode({
  code,
  hashes,
}: {
  code: string;
  hashes: readonly string[];
}): string[] | null {
  if (normalize(code).length !== 10) return null;

  const hashed = hashRecoveryCode(code);
  let matched = -1;

  hashes.forEach((hash, index) => {
    if (constantTimeEqual(hash, hashed) && matched === -1) matched = index;
  });

  return matched === -1 ? null : hashes.filter((_, index) => index !== matched);
}
