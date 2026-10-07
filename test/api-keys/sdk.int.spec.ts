import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createFrogBotSDK,
  type FrogBotSDK,
  FrogBotSDKError,
} from '../../packages/sdk/src/index.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const credentials = {
  email: 'sdk-api-key-owner@frogbot.local',
  password: 'frogbot-test-password',
};

describe('FrogBot SDK with an API key', () => {
  let booted: BootedFrogBot;
  let sdk: FrogBotSDK;
  let token: string;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'api-keys-sdk');
    sdk = createFrogBotSDK({ baseURL: `${booted.baseUrl}/api` });

    await clearAndSeed(booted.frogbot, 'empty');

    await booted.frogbot.create({
      collection: 'accounts',
      data: credentials,
      overrideAccess: true,
    } as never);

    const login = await sdk.login({ collection: 'accounts', data: credentials });

    const mint = await sdk.request('/credentials/mint', {
      headers: { Authorization: `JWT ${login.token}` },
      json: { name: 'SDK' },
      method: 'POST',
    });

    token = ((await mint.json()) as { token: string }).token;
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  it('find authenticates with an Authorization: Bearer API key', async () => {
    const result = await sdk.find(
      { collection: 'credentials' },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]).toMatchObject({ name: 'SDK' });
  });

  it('find without the API key is rejected with FrogBotSDKError', async () => {
    const error = await sdk.find({ collection: 'credentials' }).catch((e) => e);

    expect(error).toBeInstanceOf(FrogBotSDKError);
    expect(error.status).toBe(403);
  });
});
