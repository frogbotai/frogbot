import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot.js';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('API keys plugin integration', () => {
  let booted: BootedFrogbot;
  let upstream: Server;
  const credentials = {
    email: 'api-key-owner@frogbot.local',
    password: 'frogbot-test-password',
  };

  beforeAll(async () => {
    upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'chatcmpl-api-key',
          object: 'chat.completion',
          created: 1,
          model: 'allowed',
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
    await new Promise<void>((resolve) => upstream.listen(3988, '127.0.0.1', resolve));
    booted = await bootFrogbot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('boots the plugin with real persistence and HTTP', async () => {
    const response = await booted.restClient.post<{ doc: { id: number | string } }>(
      '/api/accounts',
      {
        ...credentials,
      },
    );

    expect(response.status).toBe(201);
    const account = await booted.frogbot.findByID({
      collection: 'accounts',
      id: response.body.doc.id,
      overrideAccess: true,
    });
    expect(account).toMatchObject({ email: 'api-key-owner@frogbot.local' });
  });

  it('mints, authenticates, and revokes an API key through HTTP', async () => {
    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );
    expect(login.status).toBe(200);
    const authorization = { Authorization: `JWT ${login.body.token}` };
    const mint = await booted.restClient.post<{
      id: number | string;
      prefix: string;
      token: string;
    }>('/api/credentials/mint', { name: 'Integration' }, { headers: authorization });
    expect(mint.status).toBe(201);
    expect(mint.body.token).toMatch(/^test_[A-Za-z0-9_-]{43}$/);

    const authenticated = await booted.restClient.get<{ docs: unknown[] }>('/api/credentials', {
      headers: { 'x-service-key': mint.body.token },
    });
    expect(authenticated.status).toBe(200);
    expect(authenticated.body.docs).toHaveLength(1);

    const stored = (await booted.frogbot.findByID({
      collection: 'credentials',
      id: mint.body.id,
      overrideAccess: true,
    })) as Record<string, unknown>;
    expect(stored).not.toHaveProperty('token');
    expect(stored.tokenHash).toEqual(expect.any(String));
    expect(stored.prefix).toBe(mint.body.prefix);

    const revoked = await booted.restClient.post(
      `/api/credentials/${mint.body.id}/revoke`,
      undefined,
      { headers: authorization },
    );
    expect(revoked.status).toBe(200);
    const rejected = await booted.restClient.get('/api/credentials', {
      headers: { 'x-service-key': mint.body.token },
    });
    expect(rejected.status).toBe(403);
  });

  it('enforces user model and budget policy and records spend', async () => {
    const owner = (
      await booted.frogbot.find({
        collection: 'accounts',
        where: { email: { equals: credentials.email } },
        overrideAccess: true,
        limit: 1,
      })
    ).docs[0]!;
    await booted.frogbot.update({
      collection: 'accounts',
      id: owner.id,
      data: { monthlyBudget: 10, models: ['test/allowed'], spendThisPeriodUSD: 0 },
      overrideAccess: true,
    });
    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );
    const mint = await booted.restClient.post<{ token: string }>(
      '/api/credentials/mint',
      { name: 'Policy' },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );
    const request = (model: string) =>
      booted.restClient.post(
        '/api/ai/v1/chat/completions',
        { model, messages: [{ role: 'user', content: 'Hello' }] },
        { headers: { 'x-service-key': mint.body.token } },
      );

    expect((await request('test/blocked')).status).toBe(403);
    expect((await request('test/allowed')).status).toBe(200);
    const spent = await booted.frogbot.findByID({
      collection: 'accounts',
      id: owner.id,
      overrideAccess: true,
    });
    expect(spent.spendThisPeriodUSD).toBe(3);

    await booted.frogbot.update({
      collection: 'accounts',
      id: owner.id,
      data: { spendThisPeriodUSD: 10 },
      overrideAccess: true,
    });
    expect((await request('test/allowed')).status).toBe(403);
  });
});
