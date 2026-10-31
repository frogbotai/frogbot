import { createHash, generateKeyPairSync, type KeyObject, sign } from 'node:crypto';

/** A local RS256 key and JWKS that stand in for OpenAI's sign-in keys. */
export function signingKey(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  return {
    kid,
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' },
  };
}

/** An RS256 JWT with `claims`, signed by `key`. */
export function idToken(
  key: { kid: string; privateKey: KeyObject },
  claims: Record<string, unknown>,
): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT', kid: key.kid })}.${encode(claims)}`;

  return `${input}.${sign('sha256', Buffer.from(input), key.privateKey).toString('base64url')}`;
}

/** The PKCE challenge for `verifier`, as OpenAI checks it. */
export function challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
