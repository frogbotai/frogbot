import { createHash, randomBytes } from 'node:crypto';

export type PKCECodes = {
  verifier: string;
  challenge: string;
  challengeMethod: 'S256';
};

export function createPKCECodes({ verifier = randomBytes(32).toString('base64url') }: { verifier?: string } = {}): PKCECodes {
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    challengeMethod: 'S256',
  };
}
