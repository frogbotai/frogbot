import { generateKeyPairSync, verify } from 'node:crypto';

import { decrypt, generateKey, readMessage, readPrivateKey } from 'openpgp';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../packages/frogbot/src/getFrogbot.js', () => ({
  createDefaultRequest: vi.fn(),
}));
vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createCrypto } from '../../../packages/pieces/piece-crypto/src/index.js';

const crypto = createCrypto();
const req = {} as never;

afterEach(() => vi.unstubAllGlobals());

describe('crypto', () => {
  it('exposes every registered upstream action under semantic names', () => {
    const actions = [
      'hashText',
      'generateHmac',
      'generateRsaSignature',
      'generatePassword',
      'decodeBase64',
      'encodeBase64',
      'encryptFile',
    ];

    expect(pieceFactoryDefinition(createCrypto).actions.map(({ slug }) => slug)).toEqual(actions);
    expect(pieceInstanceTools(crypto)?.map(({ slug }) => slug)).toEqual(
      actions.map((slug) => `crypto_${slug}`),
    );
    expect(crypto.triggers).toEqual({});
  });

  it('hashes, signs, and encodes controlled text', async () => {
    await expect(
      crypto.hashText({ input: { method: 'sha256', text: 'FrogBot' }, req }),
    ).resolves.toBe('5e59dc5bf59d190e031c674917044cb272072e6ab2f3d03579436614f0a32f8a');
    await expect(
      crypto.generateHmac({
        input: {
          secretKey: 'secret',
          secretKeyEncoding: 'utf-8',
          method: 'sha256',
          text: 'FrogBot',
          outputEncoding: 'hex',
        },
        req,
      }),
    ).resolves.toBe('9414f192831ab43fe4e864999481c402dc4a5388dee09382242b95bff494c7e6');
    await expect(crypto.encodeBase64({ input: { text: 'FrogBot' }, req })).resolves.toBe(
      'RnJvZ0JvdA==',
    );
    await expect(crypto.decodeBase64({ input: { text: 'RnJvZ0JvdA==' }, req })).resolves.toBe(
      'FrogBot',
    );
  });

  it('generates passwords from the selected character set', async () => {
    const password = await crypto.generatePassword({
      input: { length: 128, characterSet: 'alphanumeric' },
      req,
    });

    expect(password).toHaveLength(128);
    expect(password).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('generates a verifiable RSA signature', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signature = await crypto.generateRsaSignature({
      input: {
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        method: 'sha256',
        text: 'FrogBot',
        outputEncoding: 'base64',
      },
      req,
    });

    expect(
      verify('sha256', Buffer.from('FrogBot'), publicKey, Buffer.from(signature, 'base64')),
    ).toBe(true);
  });

  it('encrypts a stored file and persists the armored result', async () => {
    const { publicKey, privateKey } = await generateKey({
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [{ name: 'FrogBot' }],
    });
    const create = vi.fn(async ({ file }: { file: { data: Buffer } }) => {
      const message = await readMessage({ armoredMessage: file.data.toString() });
      const decrypted = await decrypt({
        message,
        decryptionKeys: await readPrivateKey({ armoredKey: privateKey }),
        format: 'binary',
      });

      expect(Buffer.from(decrypted.data)).toEqual(Buffer.from('controlled input'));

      return { id: 'encrypted-file' };
    });
    const findByID = vi.fn(async () => ({
      url: '/api/files/source-file',
      filename: 'input.txt',
    }));
    const fetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('controlled input'),
    );
    const request = {
      url: 'https://app.test/action',
      headers: new Headers({ authorization: 'Bearer token', cookie: 'session=private' }),
      signal: undefined,
      frogbot: {
        config: {
          files: { slug: 'files' },
          _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
        },
        findByID,
        create,
      },
    } as never;

    vi.stubGlobal('fetch', fetch);

    const result = await crypto.encryptFile({
      input: { file: 'source-file', publicKey },
      req: request,
    });

    expect(result).toEqual({ success: true, filename: 'input.txt.pgp', file: 'encrypted-file' });
    expect(findByID).toHaveBeenCalledWith({
      collection: 'files',
      id: 'source-file',
      depth: 0,
      req: request,
      overrideAccess: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    const fetchOptions = fetch.mock.calls[0]![1];

    expect(fetchOptions).toMatchObject({ redirect: 'error' });
    expect(new Headers(fetchOptions?.headers).get('authorization')).toBe('Bearer token');
    expect(create).toHaveBeenCalledWith({
      collection: 'files',
      data: {},
      req: request,
      overrideAccess: false,
      file: expect.objectContaining({
        name: 'input.txt.pgp',
        mimetype: 'application/pgp-encrypted',
      }),
    });
  });

  it('does not send request credentials to external file storage', async () => {
    const { publicKey } = await generateKey({
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [{ name: 'FrogBot' }],
    });
    const fetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('controlled input'),
    );

    vi.stubGlobal('fetch', fetch);

    await crypto.encryptFile({
      input: { file: 'source-file', publicKey },
      req: {
        url: 'https://app.test/action',
        headers: new Headers({ authorization: 'Bearer token', cookie: 'session=private' }),
        frogbot: {
          config: {
            files: { slug: 'files' },
            _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
          },
          findByID: async () => ({ url: 'https://storage.test/signed', filename: 'input.txt' }),
          create: async () => ({ id: 'encrypted-file' }),
        },
      } as never,
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    const fetchOptions = fetch.mock.calls[0]![1];

    expect(fetchOptions).toMatchObject({ redirect: 'error' });
    expect([...new Headers(fetchOptions?.headers)]).toEqual([]);
  });

  it('returns the upstream error result for encryption failures', async () => {
    await expect(
      crypto.encryptFile({
        input: { file: 'source-file', publicKey: 'invalid' },
        req: {
          url: 'https://app.test/action',
          headers: new Headers(),
          frogbot: { config: { files: undefined } },
        } as never,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Crypto file encryption requires a configured files collection.',
    });
  });
});
