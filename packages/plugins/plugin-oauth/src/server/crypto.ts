import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type OAuthEncryption = {
  encrypt(value: string): Promise<string> | string;
  decrypt(value: string): Promise<string> | string;
};

export function createOAuthEncryption({ secret }: { secret: string }): OAuthEncryption {
  const key = createHash('sha256').update('frogbot:plugin-oauth:').update(secret).digest();
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
    },
    decrypt(value) {
      const [version, encodedIV, encodedTag, encodedValue] = value.split('.');
      if (version !== 'v1' || !encodedIV || !encodedTag || encodedValue === undefined) {
        throw new OAuthCryptoError();
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIV, 'base64url'));
        decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(encodedValue, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new OAuthCryptoError();
      }
    },
  };
}

export class OAuthCryptoError extends Error {
  constructor() {
    super('OAuth credentials could not be decrypted.');
    this.name = 'OAuthCryptoError';
  }
}
