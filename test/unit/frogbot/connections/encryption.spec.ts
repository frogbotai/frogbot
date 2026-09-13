import { createCipheriv, createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createCredentialEncryption,
  CredentialCryptoError,
} from '../../../../packages/frogbot/src/connections/encryption.js';

function encryptWithLabel(value: string, secret: string, label: string): string {
  const key = createHash('sha256').update(label).update(secret).digest();
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

describe('credential encryption', () => {
  it('round-trips and writes a core-label ciphertext', async () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    const encrypted = await encryption.encrypt('value');
    expect(await encryption.decrypt(encrypted)).toBe('value');
    expect(
      await encryption.decrypt(encryptWithLabel('value', 'secret', 'frogbot:connections:')),
    ).toBe('value');
  });

  it('rejects tampering', async () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    const encrypted = await encryption.encrypt('value');
    expect(() => encryption.decrypt(`${encrypted}x`)).toThrow(CredentialCryptoError);
  });

  it('rejects truncated authentication tags and extra envelope segments', async () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    const encrypted = await encryption.encrypt('value');
    const [version, iv, tag, value] = encrypted.split('.');
    const truncatedTag = Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url');
    expect(() => encryption.decrypt([version, iv, truncatedTag, value].join('.'))).toThrow(
      CredentialCryptoError,
    );
    expect(() => encryption.decrypt(`${encrypted}.ignored`)).toThrow(CredentialCryptoError);
  });

  it('uses fresh nonces and rejects the wrong key', async () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    const first = await encryption.encrypt('value');
    expect(await encryption.encrypt('value')).not.toBe(first);
    expect(() => createCredentialEncryption({ secret: 'wrong' }).decrypt(first)).toThrow(
      CredentialCryptoError,
    );
    expect(await encryption.decrypt(await encryption.encrypt(''))).toBe('');
  });

  it('rejects ciphertext from another encryption domain', () => {
    const encryption = createCredentialEncryption({ secret: 'secret' });
    expect(() => encryption.decrypt(encryptWithLabel('value', 'secret', 'other-domain:'))).toThrow(
      CredentialCryptoError,
    );
  });
});
