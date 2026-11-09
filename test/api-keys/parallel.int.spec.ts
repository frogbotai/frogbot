import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const credentials = {
  email: 'parallel-api-key-owner@frogbot.local',
  password: 'frogbot-test-password',
};

describe('one API key used by parallel requests', () => {
  let booted: BootedFrogBot;
  let keyId: number | string;
  let token: string;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'api-keys-parallel');

    await clearAndSeed(booted.frogbot, 'empty');

    await booted.frogbot.create({
      collection: 'accounts',
      data: credentials,
      overrideAccess: true,
    } as never);

    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );

    const mint = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name: 'Parallel' },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    keyId = mint.body.id;
    token = mint.body.token;
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('signs in all 10 requests and stamps lastUsedAt', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        booted.restClient.get<{ user: { email: string } | null }>('/api/accounts/me', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(200));
    expect(responses.map((response) => response.body.user?.email)).toEqual(
      Array(10).fill(credentials.email),
    );

    const key = await booted.frogbot.findByID({
      collection: 'credentials',
      id: keyId,
      overrideAccess: true,
    });

    expect(key.lastUsedAt).toEqual(expect.any(String));
  });
});
