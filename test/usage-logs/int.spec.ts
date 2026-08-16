import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('usage logs', () => {
  let defaultBooted: BootedFrogbot;

  beforeAll(async () => {
    defaultBooted = await bootFrogbot(dirname, 'usage-logs-default');
  });

  afterAll(async () => {
    await defaultBooted.shutdown();
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
      model: 'zen/deepseek-v4-flash-free',
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
        model: 'zen/deepseek-v4-flash-free',
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
});
