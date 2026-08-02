import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { adaptCredential } from './adapters.js';

describe('credential adapters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adapts standard credential formats', async () => {
    await expect(adaptCredential('secret_text', { apiKey: 'key' })).resolves.toEqual({ type: 'SECRET_TEXT', secret_text: 'key' });
    await expect(adaptCredential('basic_auth', { username: 'frog', password: 'bot' })).resolves.toEqual({ username: 'frog', password: 'bot' });
    await expect(adaptCredential('oauth2', { access_token: 'token' })).resolves.toEqual({ type: 'OAUTH2', access_token: 'token' });
  });

  it.each([
    [{ apiKey: 'sk-test' }, 'sk-test'],
    [{ value: 'sk-test' }, 'sk-test'],
    [{ token: 'sk-test' }, 'sk-test'],
    [{}, ''],
  ])('adapts secret text to the Activepieces connection shape', async (credentials, secretText) => {
    await expect(adaptCredential('secret_text', credentials)).resolves.toEqual({
      type: 'SECRET_TEXT',
      secret_text: secretText,
    });
  });

  it('mints and caches impersonated service-account tokens', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const credential = {
      client_email: 'service@example.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      token_uri: 'https://example.com/token',
      scopes: ['read'],
      subject: 'user@example.com',
    };
    await expect(adaptCredential('service_account', credential)).resolves.toEqual({ type: 'OAUTH2', access_token: 'token' });
    await adaptCredential('service_account', credential);
    expect(fetch).toHaveBeenCalledOnce();
    const assertion = new URLSearchParams(fetch.mock.calls[0][1].body).get('assertion')!;
    expect(JSON.parse(Buffer.from(assertion.split('.')[1]!, 'base64url').toString())).toMatchObject({ sub: 'user@example.com', scope: 'read' });
  });
});
