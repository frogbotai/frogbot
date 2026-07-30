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

  it('allows an authenticated user to read the default collection', async () => {
    const credentials = {
      email: 'admin@frogbot.local',
      password: 'frogbot-test-password',
    };
    await defaultBooted.restClient.post('/api/users', credentials);
    const login = await defaultBooted.restClient.post<{ token: string }>('/api/users/login', credentials);
    const response = await defaultBooted.restClient.get<{ collections: Record<string, { read?: boolean }> }>('/api/access', {
      headers: { Authorization: `JWT ${login.body.token}` },
    });

    expect(response.status).toBe(200);
    expect(response.body.collections['usage-logs']?.read).toBe(true);
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
