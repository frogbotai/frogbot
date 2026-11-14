import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('a revoked API key on collections added after apiKeysPlugin', () => {
  let booted: BootedFrogBot;
  let session: { Authorization: string };
  const credentials = { email: 'late@frogbot.local', password: 'frogbot-test-password' };

  const revoked = async () => {
    const minted = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/api-keys/mint',
      { name: 'Gone' },
      { headers: session },
    );

    expect(minted.status).toBe(201);

    const { id, token } = minted.body;
    const revoke = await booted.restClient.post(`/api/api-keys/${id}/revoke`, undefined, {
      headers: session,
    });

    expect(revoke.status).toBe(200);

    const stored = await booted.frogbot.findByID({
      collection: 'api-keys',
      id,
      depth: 0,
      overrideAccess: true,
    });

    return {
      headers: { 'x-api-key': token },
      message: `API key was revoked at ${stored.revokedAt as string}. Mint a new one with POST /api/api-keys/mint.`,
    };
  };

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'api-keys-all-collections');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.frogbot.create({ collection: 'users', data: credentials, overrideAccess: true });
    const login = await booted.restClient.post<{ token: string }>('/api/users/login', credentials);
    session = { Authorization: `JWT ${login.body.token}` };
  });

  it.each([
    ['a plugin listed after apiKeysPlugin', 'posts'],
    ['a plugin with a higher order', 'pages'],
  ])('refuses it on a public collection added by %s', async (_, collection) => {
    await booted.frogbot.create({
      collection,
      data: { title: 'public' },
      overrideAccess: true,
    });

    const key = await revoked();

    const response = await booted.restClient.get<{ errors?: { message: string }[] }>(
      `/api/${collection}`,
      { headers: key.headers },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(401);
    expect(response.body.errors?.[0]?.message).toBe(key.message);
  });

  it('refuses it with the reason on a collection core adds', async () => {
    const key = await revoked();

    const response = await booted.restClient.get<{ errors?: { message: string }[] }>(
      '/api/messages',
      { headers: key.headers },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(401);
    expect(response.body.errors?.[0]?.message).toBe(key.message);
    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer error="invalid_token", error_description="${key.message}"`,
    );
  });
});
