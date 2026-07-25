import { createCipheriv, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { CredentialCryptoError, createCredentialEncryption } from './encryption.js';

function legacyEncrypt(value: string, secret: string): string {
  const key = createHash('sha256').update('frogbot:plugin-oauth:').update(secret).digest();
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

describe('credential encryption', () => {
  it('round-trips and writes a core-label ciphertext', async () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    const encrypted = await encryption.encrypt('value');
    expect(await encryption.decrypt(encrypted)).toBe('value');
    expect(encrypted).not.toBe(legacyEncrypt('value', 'secret'));
  });

  it('rejects tampering', async () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    const encrypted = await encryption.encrypt('value');
    expect(() => encryption.decrypt(`${encrypted}x`)).toThrow(CredentialCryptoError);
  });

  it('decrypts legacy ciphertext and re-encrypts with the core label', async () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    const legacy = legacyEncrypt('value', 'secret');
    expect(await encryption.decrypt(legacy)).toBe('value');
    const rewritten = await encryption.encrypt(await encryption.decrypt(legacy));
    expect(rewritten).not.toBe(legacy);
    expect(await encryption.decrypt(rewritten)).toBe('value');
  });
});
