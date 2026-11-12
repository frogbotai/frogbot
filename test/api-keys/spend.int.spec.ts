import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { spendUpstreamPort } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-test-password';
const callCost = 3;
const calls = 30;

describe('recording spend under parallel gateway calls', () => {
  let booted: BootedFrogBot;
  let upstream: Server;

  beforeAll(async () => {
    upstream = createServer((request, response) => {
      let body = '';

      request.on('data', (chunk) => (body += chunk));

      request.on('end', () => {
        const { model } = JSON.parse(body) as { model: string };

        response.writeHead(200, { 'content-type': 'application/json' });

        response.end(
          JSON.stringify({
            id: 'chatcmpl-spend',
            created: 1,
            model,
            object: 'chat.completion',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
            ],
            usage: {
              prompt_tokens: 1_000_000,
              completion_tokens: 1_000_000,
              total_tokens: 2_000_000,
            },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => upstream.listen(spendUpstreamPort, '127.0.0.1', resolve));
    booted = await bootFrogBot(dirname, 'api-keys-spend');
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterAll(async () => {
    await booted.shutdown();

    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  });

  const createAccount = async (email: string, data: Record<string, unknown> = {}) => {
    const account = await booted.frogbot.create({
      collection: 'accounts',
      data: { email, password, ...data },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>('/api/accounts/login', {
      email,
      password,
    });

    return { id: account.id, session: { Authorization: `JWT ${login.body.token}` } };
  };

  const mint = async (headers: Record<string, string>, data: Record<string, unknown>) => {
    const response = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name: 'Spend', data },
      { headers },
    );

    expect(response.status, JSON.stringify(response.body)).toBe(201);

    return response.body;
  };

  const complete = (token: string) =>
    booted.restClient.post(
      '/api/v1/chat/completions',
      {
        model: 'spend/priced',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      { headers: { 'x-service-key': token } },
    );

  const read = (collection: 'accounts' | 'credentials', id: number | string) =>
    booted.frogbot.findByID({ collection, id, depth: 0, overrideAccess: true });

  it('keeps roles and model lists and adds up every call exactly', async () => {
    const owner = await createAccount('spend-owner@frogbot.local', {
      roles: ['admin'],
      models: ['spend/priced', 'spend/other'],
    });

    const parent = await mint(owner.session, { canMint: true, models: ['spend/priced'] });
    const child = await mint({ 'x-service-key': parent.token }, {});

    const responses = await Promise.all(Array.from({ length: calls }, () => complete(child.token)));

    expect(responses.map(({ status }) => status)).toEqual(Array(calls).fill(200));

    const total = calls * callCost;

    await vi.waitFor(
      async () => {
        expect((await read('accounts', owner.id)).spendThisPeriodUSD).toBeCloseTo(total);
        expect((await read('credentials', parent.id)).spendThisPeriodUSD).toBeCloseTo(total);
        expect((await read('credentials', child.id)).spendThisPeriodUSD).toBeCloseTo(total);
      },
      { timeout: 10_000 },
    );

    expect(await read('accounts', owner.id)).toMatchObject({
      roles: ['admin'],
      models: ['spend/priced', 'spend/other'],
    });
    expect((await read('credentials', parent.id)).models).toEqual(['spend/priced']);
    expect((await read('credentials', child.id)).models).toEqual(['spend/priced']);

    await booted.payload.jobs.queue({
      task: 'plugin-ai-policy-reset-spend',
      input: {},
      overrideAccess: true,
    });

    await booted.payload.jobs.run({ queue: 'default', overrideAccess: true });

    expect(await read('accounts', owner.id)).toMatchObject({
      roles: ['admin'],
      models: ['spend/priced', 'spend/other'],
      spendThisPeriodUSD: 0,
    });
    expect(await read('credentials', parent.id)).toMatchObject({
      models: ['spend/priced'],
      spendThisPeriodUSD: 0,
    });
    expect((await read('credentials', child.id)).spendThisPeriodUSD).toBe(0);
  });

  it('counts spend from 0 on a row whose spend is null', async () => {
    const owner = await createAccount('spend-null@frogbot.local');
    const key = await mint(owner.session, {});

    for (const [collection, id] of [
      ['accounts', owner.id],
      ['credentials', key.id],
    ] as const) {
      await booted.payload.db.updateOne({
        collection,
        id,
        data: { spendThisPeriodUSD: null },
        returning: false,
      });

      expect((await read(collection, id)).spendThisPeriodUSD ?? null).toBeNull();
    }

    const responses = await Promise.all(Array.from({ length: 3 }, () => complete(key.token)));

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);

    await vi.waitFor(async () => {
      expect((await read('accounts', owner.id)).spendThisPeriodUSD).toBeCloseTo(3 * callCost);
      expect((await read('credentials', key.id)).spendThisPeriodUSD).toBeCloseTo(3 * callCost);
    });
  });
});
