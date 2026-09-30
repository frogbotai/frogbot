import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import config, { agentSlug } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('API keys plugin integration', () => {
  let booted: BootedFrogBot;
  let upstream: Server;
  const modelCalls: string[] = [];
  const credentials = {
    email: 'api-key-owner@frogbot.local',
    password: 'frogbot-test-password',
  };

  beforeAll(async () => {
    upstream = createServer((request, response) => {
      let body = '';

      request.on('data', (chunk) => (body += chunk));

      request.on('end', () => {
        const { model, stream } = JSON.parse(body) as { model: string; stream?: boolean };
        const completion = { id: 'chatcmpl-api-key', created: 1, model };
        const usage = {
          prompt_tokens: 1_000_000,
          completion_tokens: 1_000_000,
          total_tokens: 2_000_000,
        };

        modelCalls.push(model);

        if (stream) {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.end(
            [
              {
                ...completion,
                object: 'chat.completion.chunk',
                choices: [
                  {
                    index: 0,
                    delta: { role: 'assistant', content: 'ok' },
                    finish_reason: null,
                  },
                ],
              },
              {
                ...completion,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                usage,
              },
            ]
              .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
              .join('') + 'data: [DONE]\n\n',
          );

          return;
        }

        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            ...completion,
            object: 'chat.completion',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
            ],
            usage,
          }),
        );
      });
    });
    await new Promise<void>((resolve) => upstream.listen(3988, '127.0.0.1', resolve));
    booted = await bootFrogBot(dirname);
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
      data: {
        modelAccess: 'selected',
        monthlyBudget: 10,
        models: ['test/allowed'],
        spendThisPeriodUSD: 0,
      },
      overrideAccess: true,
    });
    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );
    const mint = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name: 'Policy' },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );
    const request = (model: string) =>
      booted.restClient.post(
        '/api/v1/chat/completions',
        { model, messages: [{ role: 'user', content: 'Hello' }] },
        { headers: { 'x-service-key': mint.body.token } },
      );

    expect((await request('test/blocked')).status).toBe(403);

    const allowed = await request('test/allowed');

    expect(allowed.status).toBe(200);

    const spent = await booted.frogbot.findByID({
      collection: 'accounts',
      id: owner.id,
      overrideAccess: true,
    });

    expect(spent.spendThisPeriodUSD).toBe(3);

    const requestId = allowed.headers.get('x-request-id')!;

    const row = await vi.waitFor(async () => {
      const logs = await booted.frogbot.find({
        collection: 'usage-logs' as never,
        where: { requestId: { equals: requestId } },
        depth: 0,
        overrideAccess: true,
      });

      expect(logs.docs).toHaveLength(1);

      return logs.docs[0] as Record<string, unknown>;
    });

    expect(row.apiKey).toBe(mint.body.id);

    const key = (await booted.frogbot.findByID({
      collection: 'credentials',
      id: mint.body.id,
      overrideAccess: true,
    })) as Record<string, unknown>;

    expect(key.totalCostUSD).toBe(3);

    await booted.frogbot.update({
      collection: 'accounts',
      id: owner.id,
      data: { spendThisPeriodUSD: 10 },
      overrideAccess: true,
    });
    expect((await request('test/allowed')).status).toBe(403);
  });

  describe('current user through API keys', () => {
    const meCredentials = {
      email: 'api-key-me-owner@frogbot.local',
      password: 'frogbot-test-password',
    };
    let ownerId: number | string;
    let token: string;

    beforeAll(async () => {
      const owner = await booted.frogbot.create({
        collection: 'accounts',
        data: meCredentials,
        overrideAccess: true,
      });

      ownerId = owner.id;

      const login = await booted.restClient.post<{ token: string }>(
        '/api/accounts/login',
        meCredentials,
      );

      if (login.status !== 200) throw new Error(`Login failed with ${login.status}.`);

      const mint = await booted.restClient.post<{ token: string }>(
        '/api/credentials/mint',
        { name: 'Current user' },
        { headers: { Authorization: `JWT ${login.body.token}` } },
      );

      if (mint.status !== 201) throw new Error(`Mint failed with ${mint.status}.`);

      token = mint.body.token;
    });

    afterAll(async () => {
      await booted.frogbot.delete({
        collection: 'credentials',
        where: { owner: { equals: ownerId } },
        overrideAccess: true,
      });

      await booted.frogbot.delete({
        collection: 'accounts',
        id: ownerId,
        overrideAccess: true,
      });
    });

    it('GET /api/accounts/me returns the key owner for a Bearer API key without echoing it', async () => {
      const response = await booted.restClient.get<Record<string, unknown>>('/api/accounts/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.user).toMatchObject({ id: ownerId, email: meCredentials.email });
      expect(response.body).not.toHaveProperty('token');
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it('GET /api/accounts/me returns the key owner for a configured key header', async () => {
      const response = await booted.restClient.get<Record<string, unknown>>('/api/accounts/me', {
        headers: { 'x-service-key': token },
      });

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.user).toMatchObject({ id: ownerId, email: meCredentials.email });
      expect(response.body).not.toHaveProperty('token');
    });

    it('GET /api/accounts/me uses the configured key header when the Bearer value is not a key', async () => {
      const response = await booted.restClient.get<Record<string, unknown>>('/api/accounts/me', {
        headers: { Authorization: 'Bearer not-a-jwt', 'x-service-key': token },
      });

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.user).toMatchObject({ id: ownerId, email: meCredentials.email });
      expect(response.body).not.toHaveProperty('token');
    });

    it('POST /api/graphql meAccount returns the key owner for a Bearer API key', async () => {
      const response = await GRAPHQL_POST(config)(
        new Request(`${booted.baseUrl}/api/graphql`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: '{ meAccount { user { id email } token } }' }),
        }),
      );
      const body = (await response.json()) as {
        data: { meAccount: { user: unknown; token: string | null } };
        errors?: unknown;
      };

      expect(response.status).toBe(200);
      expect(body.errors).toBeUndefined();
      expect(body.data.meAccount).toEqual({
        user: { id: ownerId, email: meCredentials.email },
        token: null,
      });
    });
  });

  describe('agent model policy through API keys', () => {
    const agentCredentials = {
      email: 'api-key-agent-owner@frogbot.local',
      password: 'frogbot-test-password',
    };
    let ownerId: number | string | undefined;
    let headers: { 'x-service-key': string };

    beforeEach(async () => {
      ownerId = undefined;
      modelCalls.length = 0;

      const owner = await booted.frogbot.create({
        collection: 'accounts',
        data: {
          ...agentCredentials,
          modelAccess: 'selected',
          models: ['test/allowed'],
          spendThisPeriodUSD: 0,
        },
        overrideAccess: true,
      });

      ownerId = owner.id;

      const login = await booted.restClient.post<{ token: string }>(
        '/api/accounts/login',
        agentCredentials,
      );

      if (login.status !== 200) throw new Error(`Login failed with ${login.status}.`);

      const mint = await booted.restClient.post<{ token: string }>(
        '/api/credentials/mint',
        { name: 'Agent policy' },
        { headers: { Authorization: `JWT ${login.body.token}` } },
      );

      if (mint.status !== 201) throw new Error(`Mint failed with ${mint.status}.`);

      headers = { 'x-service-key': mint.body.token };
    });

    afterEach(async () => {
      if (ownerId === undefined) return;

      const chats = await booted.frogbot.find({
        collection: 'chats',
        where: { user: { equals: ownerId } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });

      for (const chat of chats.docs) {
        await booted.frogbot.delete({
          collection: 'messages',
          where: { chat: { equals: chat.id } },
          overrideAccess: true,
        });

        await booted.frogbot.delete({
          collection: 'frogbot-chat-turns',
          where: { id: { equals: String(chat.id) } },
          overrideAccess: true,
        });

        await booted.frogbot.delete({
          collection: 'chats',
          id: chat.id,
          overrideAccess: true,
        });
      }

      await booted.frogbot.delete({
        collection: 'credentials',
        where: { owner: { equals: ownerId } },
        overrideAccess: true,
      });

      await booted.frogbot.delete({
        collection: 'accounts',
        id: ownerId,
        overrideAccess: true,
      });
    });

    it('rejects a named model denied to the key owner before calling the model or writing chat state', async () => {
      const response = await booted.restClient.post(
        `/api/agents/${agentSlug}`,
        { prompt: 'Hello', model: 'test/blocked' },
        { headers },
      );

      expect(response.status).toBe(403);
      expect(modelCalls).toEqual([]);

      for (const collection of ['chats', 'messages', 'frogbot-chat-turns']) {
        const records = await booted.frogbot.count({ collection, overrideAccess: true });

        expect(records.totalDocs).toBe(0);
      }
    });

    it('uses the key owner allowed model when the agent default is denied and no model is requested', async () => {
      const chat = await booted.frogbot.create({
        collection: 'chats',
        data: { agent: agentSlug, user: ownerId!, title: 'API key fallback' },
        overrideAccess: true,
      });

      const response = await booted.restClient.post<{ text: string; chatId: number | string }>(
        `/api/agents/${agentSlug}`,
        { prompt: 'Hello', chatId: chat.id },
        { headers },
      );

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject({ text: 'ok', chatId: chat.id });
      expect(modelCalls).toEqual(['allowed']);

      const messages = await booted.frogbot.find({
        collection: 'messages',
        where: { chat: { equals: chat.id } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });

      expect(messages.docs).toHaveLength(2);
      expect(messages.docs.find((message) => message.role === 'assistant')).toMatchObject({
        usage: {
          model: 'test/allowed',
          provider: 'test',
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
        },
      });
    });
  });
});
