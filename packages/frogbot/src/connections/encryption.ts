import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type CredentialEncryption = {
  encrypt(value: string): Promise<string> | string;
  decrypt(value: string): Promise<string> | string;
};

const CORE_LABEL = 'frogbot:connections:';
const LEGACY_LABEL = 'frogbot:plugin-oauth:';

function keyFor(secret: string, label: string): Buffer {
  return createHash('sha256').update(label).update(secret).digest();
}

function decryptWithKey(value: string, key: Buffer): string {
  const [version, encodedIV, encodedTag, encodedValue] = value.split('.');
  if (version !== 'v1' || !encodedIV || !encodedTag || encodedValue === undefined) {
    throw new CredentialCryptoError();
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIV, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new CredentialCryptoError();
  }
}

export function createCredentialEncryption({ secret }: { secret: string }): CredentialEncryption {
  const key = keyFor(secret, CORE_LABEL);
  const legacyKey = keyFor(secret, LEGACY_LABEL);
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
    },
    decrypt(value) {
      try {
        return decryptWithKey(value, key);
      } catch {
        return decryptWithKey(value, legacyKey);
      }
    },
  };
}

export class CredentialCryptoError extends Error {
  constructor() {
    super('Credentials could not be decrypted.');
    this.name = 'CredentialCryptoError';
  }
}
