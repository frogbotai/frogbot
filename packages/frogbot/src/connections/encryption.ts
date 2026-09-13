import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type CredentialEncryption = {
  encrypt(value: string): Promise<string> | string;
  decrypt(value: string): Promise<string> | string;
};

const CORE_LABEL = 'frogbot:connections:';

function keyFor(secret: string, label: string): Buffer {
  return createHash('sha256').update(label).update(secret).digest();
}

function decryptWithKey(value: string, key: Buffer): string {
  const parts = value.split('.');
  const [version, encodedIV, encodedTag, encodedValue] = parts;
  if (
    parts.length !== 4 ||
    version !== 'v1' ||
    !encodedIV ||
    !encodedTag ||
    encodedValue === undefined
  ) {
    throw new CredentialCryptoError();
  }
  try {
    const iv = Buffer.from(encodedIV, 'base64url');
    const tag = Buffer.from(encodedTag, 'base64url');
    const encrypted = Buffer.from(encodedValue, 'base64url');
    if (
      iv.length !== 12 ||
      tag.length !== 16 ||
      iv.toString('base64url') !== encodedIV ||
      tag.toString('base64url') !== encodedTag ||
      encrypted.toString('base64url') !== encodedValue
    ) {
      throw new CredentialCryptoError();
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new CredentialCryptoError();
  }
}

export function createCredentialEncryption({ secret }: { secret: string }): CredentialEncryption {
  const key = keyFor(secret, CORE_LABEL);
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [
        'v1',
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.');
    },
    decrypt(value) {
      return decryptWithKey(value, key);
    },
  };
}

export class CredentialCryptoError extends Error {
  constructor() {
    super('Credentials could not be decrypted.');
    this.name = 'CredentialCryptoError';
  }
}
