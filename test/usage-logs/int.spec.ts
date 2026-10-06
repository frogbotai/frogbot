import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { logUsage } from '../../packages/frogbot/src/ai/logUsage.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('usage logs', () => {
  let defaultBooted: BootedFrogBot;

  beforeAll(async () => {
    defaultBooted = await bootFrogBot(dirname, 'usage-logs-default');
  });

  afterAll(async () => {
    await defaultBooted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(defaultBooted.frogbot, 'empty');
  });

  it('allows authenticated users to read usage logs', async () => {
    const firstCredentials = {
      email: 'usage-first@frogbot.local',
      password: 'frogbot-test-password',
    };
    const secondCredentials = {
      email: 'usage-second@frogbot.local',
      password: 'frogbot-test-password',
    };
    const first = await defaultBooted.frogbot.create({
      collection: 'users',
      data: firstCredentials,
      overrideAccess: true,
    });
    const second = await defaultBooted.frogbot.create({
      collection: 'users',
      data: secondCredentials,
      overrideAccess: true,
    });
    const usage = (requestId: string, user: number | string) => ({
      requestId,
      user,
      model: 'zen/big-pickle',
      operation: 'chat.completions',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      requestedAt: new Date().toISOString(),
    });
    await defaultBooted.frogbot.create({
      collection: 'usage-logs' as never,
      data: usage('first-log', first.id) as never,
      overrideAccess: true,
    });
    await defaultBooted.frogbot.create({
      collection: 'usage-logs' as never,
      data: usage('second-log', second.id) as never,
      overrideAccess: true,
    });

    const login = await defaultBooted.restClient.post<{ token: string }>(
      '/api/users/login',
      firstCredentials,
    );
    const response = await defaultBooted.restClient.get<{ docs: Array<{ requestId: string }> }>(
      '/api/usage-logs',
      {
        headers: { Authorization: `JWT ${login.body.token}` },
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.docs.map(({ requestId }) => requestId).sort()).toEqual([
      'first-log',
      'second-log',
    ]);
  });

  it('denies anonymous reads of the default collection', async () => {
    const response = await defaultBooted.restClient.get('/api/usage-logs');
    expect(response.status).toBe(403);
  });

  it('allows internal writes through overrideAccess', async () => {
    await defaultBooted.frogbot.create({
      collection: 'usage-logs' as never,
      data: {
        requestId: 'internal-write',
        model: 'zen/big-pickle',
        operation: 'chat.completions',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUSD: 0,
        requestedAt: new Date().toISOString(),
      } as never,
      overrideAccess: true,
    });

    const result = await defaultBooted.frogbot.count({
      collection: 'usage-logs' as never,
      overrideAccess: true,
      where: { requestId: { equals: 'internal-write' } },
    });
    expect(result.totalDocs).toBe(1);
  });

  describe('cost', () => {
    it('prices a custom model with its configured cost', async () => {
      logUsage({
        requestId: 'priced-write',
        model: 'zen/priced',
        operation: 'chat.completions',
        startedAt: Date.now(),
        context: { req: { frogbot: defaultBooted.frogbot } },
        usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 },
      } as never);

      await expect
        .poll(async () => {
          const result = await defaultBooted.frogbot.find({
            collection: 'usage-logs' as never,
            overrideAccess: true,
            where: { requestId: { equals: 'priced-write' } },
          });

          return (result.docs[0] as { costUSD?: number } | undefined)?.costUSD;
        })
        .toBe(3);
    });
  });
});
