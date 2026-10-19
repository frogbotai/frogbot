import {
  createCipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/** Dojo's public key for sealed keys, from `GET /api/cli/sealing-key`: raw X25519, base64url. */
export type SealingKey = { keyId: string; publicKey: string };

/** The `keys` part of a deployment upload; only Dojo's private key opens `ciphertext`. */
export type SealedKeys = {
  keyId: string;
  ephemeralPublicKey: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

const sealInfo = 'frogbot-share-keys';

/** Seals `{ NAME: value }` to Dojo's key: X25519 with a fresh key pair, HKDF-SHA256, AES-256-GCM. */
export function sealKeys(values: Record<string, string>, sealingKey: SealingKey): SealedKeys {
  const dojoKey = createPublicKey({
    key: { kty: 'OKP', crv: 'X25519', x: sealingKey.publicKey },
    format: 'jwk',
  });

  const ephemeral = generateKeyPairSync('x25519');
  const secret = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: dojoKey });
  const key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), sealInfo, 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()]);

  return {
    keyId: sealingKey.keyId,
    ephemeralPublicKey: ephemeral.publicKey.export({ format: 'jwk' }).x ?? '',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

/**
 * A key's fingerprint as Dojo stores it, so local and live values compare without sending either.
 * `salt` is the app's own, from `GET /api/apps/:app/keys`, hashed as its base64url text.
 */
export function keyFingerprint(
  salt: string,
  appId: string | number,
  name: string,
  value: string,
): string {
  return createHash('sha256').update(`${salt}\0${appId}\0${name}\0${value}`).digest('base64url');
}
