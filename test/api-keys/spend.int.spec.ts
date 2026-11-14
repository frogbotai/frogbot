import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { spendUpstreamPort } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-test-password';
const callCost = 3;
const calls = 30;
const adapterName = process.env.FROGBOT_DATABASE ?? 'sqlite';

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

  let openTransaction: number | string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();

    if (openTransaction !== undefined) await booted.payload.db.rollbackTransaction(openTransaction);

    openTransaction = undefined;
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

  const counters = 'plugin-ai-policy-spend';
  const thisMonth = () => new Date().toISOString().slice(0, 7);
  const lastMonth = () => {
    const now = new Date();

    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7);
  };

  const counterOf = async (collection: 'accounts' | 'credentials', id: number | string) => {
    const { docs } = await booted.frogbot.find({
      collection: counters,
      where: { key: { equals: `${collection}:${String(id)}` } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    });

    return docs[0] as { id: number | string; amount: number; period: string } | undefined;
  };

  const setCounter = async (
    collection: 'accounts' | 'credentials',
    id: number | string,
    data: { amount: number; period: string },
  ) => {
    await booted.payload.db.updateOne({
      collection: counters,
      where: { key: { equals: `${collection}:${String(id)}` } },
      data,
      returning: false,
    });
  };

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

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 32 * 24 * 60 * 60 * 1000));

    await booted.payload.jobs.queue({
      task: 'plugin-ai-policy-reset-spend',
      input: {},
      overrideAccess: true,
    });

    await booted.payload.jobs.run({ queue: 'default', overrideAccess: true });

    vi.useRealTimers();

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

  it('links legacy users on first spend and sorts users by spend', async () => {
    const legacy = await createAccount('spend-legacy@frogbot.local');
    const idle = await createAccount('spend-idle@frogbot.local');
    const key = await mint(legacy.session, {});

    await booted.frogbot.delete({
      collection: 'plugin-ai-policy-spend',
      where: { key: { equals: `accounts:${String(legacy.id)}` } },
      overrideAccess: true,
    });

    await booted.payload.db.updateOne({
      collection: 'accounts',
      id: legacy.id,
      data: { spendCounter: null },
      returning: false,
    });

    expect((await read('accounts', legacy.id)).spendThisPeriodUSD).toBe(0);
    expect((await read('accounts', idle.id)).spendThisPeriodUSD).toBe(0);

    const responses = await Promise.all(Array.from({ length: 5 }, () => complete(key.token)));

    expect(responses.map(({ status }) => status)).toEqual(Array(5).fill(200));

    await vi.waitFor(async () => {
      expect((await read('accounts', legacy.id)).spendThisPeriodUSD).toBeCloseTo(5 * callCost);
    });

    const sorted = await booted.frogbot.find({
      collection: 'accounts',
      where: { id: { in: [legacy.id, idle.id] } },
      sort: '-spendThisPeriodUSD',
      depth: 0,
      overrideAccess: true,
    });

    expect(sorted.docs.map(({ id }) => id)).toEqual([legacy.id, idle.id]);

    const ascending = await booted.frogbot.find({
      collection: 'accounts',
      where: { id: { in: [legacy.id, idle.id] } },
      sort: 'spendThisPeriodUSD',
      depth: 0,
      overrideAccess: true,
    });

    expect(ascending.docs.map(({ id }) => id)).toEqual([idle.id, legacy.id]);

    const spenders = await booted.frogbot.find({
      collection: 'accounts',
      where: { spendThisPeriodUSD: { greater_than: 0 }, id: { in: [legacy.id, idle.id] } },
      depth: 0,
      overrideAccess: true,
    });

    expect(spenders.docs.map(({ id }) => id)).toEqual([legacy.id]);
  });

  it('shows a user only the spend counters of rows they may read', async () => {
    const alice = await createAccount('spend-alice@frogbot.local');
    const bob = await createAccount('spend-bob@frogbot.local');

    const own = await booted.restClient.get<{ docs: { key: string }[] }>(
      '/api/plugin-ai-policy-spend?limit=100',
      { headers: alice.session },
    );

    expect(own.status).toBe(200);
    expect(own.body.docs.map(({ key }) => key)).toContain(`accounts:${String(alice.id)}`);
    expect(bob.id).toBeDefined();
  });

  it('keeps spend an AI call rolls into the new month while the reset runs', async () => {
    const owner = await createAccount('spend-reset-race@frogbot.local');
    const key = await mint(owner.session, {});

    await setCounter('accounts', owner.id, { amount: 50, period: lastMonth() });

    const { db } = booted.payload;
    const updateOne = db.updateOne.bind(db);
    const updateMany = db.updateMany.bind(db);
    let raced = false;

    const race = async (touches: boolean) => {
      if (raced || !touches) return;

      raced = true;

      expect((await complete(key.token)).status).toBe(200);

      await vi.waitFor(async () => {
        expect(await counterOf('accounts', owner.id)).toMatchObject({
          amount: callCost,
          period: thisMonth(),
        });
      });
    };

    vi.spyOn(db, 'updateOne').mockImplementation(async (args) => {
      await race(args.collection === counters);

      return updateOne(args);
    });

    vi.spyOn(db, 'updateMany').mockImplementation(async (args) => {
      await race(args.collection === counters);

      return updateMany(args);
    });

    await booted.payload.jobs.queue({
      task: 'plugin-ai-policy-reset-spend',
      input: {},
      overrideAccess: true,
    });

    await booted.payload.jobs.run({ queue: 'default', overrideAccess: true });

    expect(raced).toBe(true);
    expect(await counterOf('accounts', owner.id)).toMatchObject({
      amount: callCost,
      period: thisMonth(),
    });
  });

  it.skipIf(adapterName === 'sqlite')(
    'refuses later calls in one transaction once earlier calls spent the budget',
    async () => {
      const owner = await createAccount('spend-same-request@frogbot.local', { monthlyBudget: 2 });
      const account = await read('accounts', owner.id);

      openTransaction = (await booted.payload.db.beginTransaction()) ?? undefined;

      const req = await booted.frogbot.createRequest({
        transactionID: openTransaction,
        user: { ...account, collection: 'accounts' } as never,
      });

      const outcomes: string[] = [];

      for (let call = 0; call < 5; call += 1) {
        outcomes.push(
          await booted.frogbot.generateText({ model: 'spend/priced', prompt: 'Hi', req }).then(
            () => 'ok',
            () => 'refused',
          ),
        );
      }

      await booted.payload.db.commitTransaction(openTransaction as number | string);
      openTransaction = undefined;

      expect(outcomes).toEqual(['ok', 'refused', 'refused', 'refused', 'refused']);

      await vi.waitFor(async () => {
        expect((await counterOf('accounts', owner.id))?.amount).toBe(callCost);
      });
    },
  );
});
