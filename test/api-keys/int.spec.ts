import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import config, { agentSlug, upstreamPort } from './config.js';
import type { Account } from './frogbot-types.js';

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

    await new Promise<void>((resolve) => upstream.listen(upstreamPort, '127.0.0.1', resolve));
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();

    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  const createOwner = () =>
    booted.frogbot.create({
      collection: 'accounts',
      data: credentials,
      overrideAccess: true,
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
    await createOwner();
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

    const stored = await booted.frogbot.findByID({
      collection: 'credentials',
      id: mint.body.id,
      overrideAccess: true,
    });

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

  it('refuses minting and rotating with an API key but lets the key revoke itself', async () => {
    await createOwner();
    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );

    const mint = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name: 'Stolen' },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    expect(mint.status).toBe(201);

    const keyHeaders = { 'x-service-key': mint.body.token };
    const minted = await booted.restClient.post<{ error: string }>(
      '/api/credentials/mint',
      { name: 'Persist' },
      { headers: keyHeaders },
    );

    expect(minted.status).toBe(403);
    expect(minted.body.error).toMatch(/cannot mint or rotate/);

    const rotated = await booted.restClient.post(
      `/api/credentials/${mint.body.id}/rotate`,
      undefined,
      { headers: keyHeaders },
    );

    expect(rotated.status).toBe(403);

    const keys = await booted.frogbot.find({
      collection: 'credentials',
      overrideAccess: true,
      where: { revokedAt: { exists: false } },
    });

    expect(keys.docs.map((doc) => doc.id)).toEqual([mint.body.id]);

    const revoked = await booted.restClient.post(
      `/api/credentials/${mint.body.id}/revoke`,
      undefined,
      { headers: keyHeaders },
    );

    expect(revoked.status).toBe(200);
  });

  it('enforces user model and budget policy and records spend', async () => {
    const owner = await createOwner();

    await booted.frogbot.update({
      collection: 'accounts',
      id: owner.id,
      data: {
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
        collection: 'usage-logs',
        where: { requestId: { equals: requestId } },
        depth: 0,
        overrideAccess: true,
      });

      expect(logs.docs).toHaveLength(1);

      return logs.docs[0];
    });

    expect(row.apiKey).toBe(mint.body.id);

    const key = await booted.frogbot.findByID({
      collection: 'credentials',
      id: mint.body.id,
      overrideAccess: true,
    });

    expect(key.totalCostUSD).toBe(3);

    await booted.frogbot.update({
      collection: 'accounts',
      id: owner.id,
      data: { spendThisPeriodUSD: 10 },
      overrideAccess: true,
    });

    const exhausted = await request('test/allowed');

    expect(exhausted.status).toBe(403);
    expect(exhausted.body).toMatchObject({
      error: { code: 'budget_exceeded', message: 'The configured budget has been exhausted.' },
    });
  });

  describe('current user through API keys', () => {
    const meCredentials = {
      email: 'api-key-me-owner@frogbot.local',
      password: 'frogbot-test-password',
    };

    let ownerId: Account['id'];
    let token: string;

    beforeEach(async () => {
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

    let ownerId: Account['id'];
    let headers: { 'x-service-key': string };

    beforeEach(async () => {
      modelCalls.length = 0;

      const owner = await booted.frogbot.create({
        collection: 'accounts',
        data: {
          ...agentCredentials,
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

    it('rejects a named model denied to the key owner before calling the model or writing chat state', async () => {
      const response = await booted.restClient.post(
        `/api/agents/${agentSlug}`,
        { prompt: 'Hello', model: 'test/blocked' },
        { headers },
      );

      expect(response.status).toBe(403);
      expect(modelCalls).toEqual([]);

      for (const collection of ['chats', 'messages', 'frogbot-chat-turns'] as const) {
        const records = await booted.frogbot.count({ collection, overrideAccess: true });

        expect(records.totalDocs).toBe(0);
      }
    });

    it('uses the key owner allowed model when the agent default is denied and no model is requested', async () => {
      const chat = await booted.frogbot.create({
        collection: 'chats',
        data: { agent: agentSlug, user: ownerId, title: 'API key fallback' },
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

  describe('API key limits', () => {
    const limitCredentials = {
      email: 'api-key-limits@frogbot.local',
      password: 'frogbot-test-password',
    };

    let ownerId: Account['id'];
    let session: { Authorization: string };

    beforeEach(async () => {
      modelCalls.length = 0;

      const owner = await booted.frogbot.create({
        collection: 'accounts',
        data: { ...limitCredentials, monthlyBudget: 50 },
        overrideAccess: true,
      });

      ownerId = owner.id;

      const login = await booted.restClient.post<{ token: string }>(
        '/api/accounts/login',
        limitCredentials,
      );

      session = { Authorization: `JWT ${login.body.token}` };
    });

    const mintKey = (data: Record<string, unknown>) =>
      booted.restClient.post<{ id: number | string; token: string; error?: string }>(
        '/api/credentials/mint',
        { name: 'CI bot', data },
        { headers: session },
      );

    const setSpend = (collection: 'accounts' | 'credentials', id: number | string, spend: number) =>
      booted.frogbot.update({
        collection,
        id,
        data: { spendThisPeriodUSD: spend },
        overrideAccess: true,
      });

    const spendOf = async (collection: 'accounts' | 'credentials', id: number | string) =>
      (await booted.frogbot.findByID({ collection, id, overrideAccess: true })).spendThisPeriodUSD;

    const complete = (token: string, model = 'test/allowed') =>
      booted.restClient.post<{ error: { code?: string; type?: string; message: string } }>(
        '/api/v1/chat/completions',
        { model, messages: [{ role: 'user', content: 'Hello' }] },
        { headers: { 'x-service-key': token } },
      );

    it('stops a key at its cap, and the owner at their budget first', async () => {
      const key = await mintKey({ monthlyBudget: 25 });

      expect(key.status, JSON.stringify(key.body)).toBe(201);

      await setSpend('credentials', key.body.id, 25);

      const capped = await complete(key.body.token);

      expect(capped.status).toBe(403);
      expect(JSON.stringify(capped.body)).toContain('budget_exceeded');
      expect(capped.body.error.message).toBe(
        'API key "CI bot" has used its monthly cap of $25.00.',
      );

      await setSpend('credentials', key.body.id, 0);

      await booted.frogbot.update({
        collection: 'credentials',
        id: key.body.id,
        data: { monthlyBudget: 40 },
        overrideAccess: true,
      });

      await setSpend('accounts', ownerId, 50);

      const owner = await complete(key.body.token);

      expect(owner.status).toBe(403);
      expect(owner.body.error.message).toBe('The configured budget has been exhausted.');
      expect(modelCalls).toEqual([]);
    });

    it('limits a key to its models on both gateway routes and in agent lists', async () => {
      const key = await mintKey({ models: ['test/allowed'] });
      const headers = { 'x-service-key': key.body.token };
      const blocked = await complete(key.body.token, 'test/blocked');
      const messages = await booted.restClient.post(
        '/api/v1/messages',
        { model: 'test/blocked', max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] },
        { headers },
      );

      const message = 'Model "test/blocked" is not allowed for API key "CI bot".';

      expect(blocked.status).toBe(403);
      expect(blocked.body).toEqual({
        error: {
          message,
          type: 'invalid_request_error',
          code: 'model_not_allowed',
          param: 'model',
        },
      });
      expect(messages.status).toBe(403);
      expect(messages.body).toEqual({
        type: 'error',
        error: { type: 'permission_error', message, param: 'model' },
      });

      expect(modelCalls).toEqual([]);

      const logs = await booted.frogbot.count({ collection: 'usage-logs', overrideAccess: true });

      expect(logs.totalDocs).toBe(0);

      const agents = await booted.restClient.get<{ agents: { slug: string; models: string[] }[] }>(
        '/api/agents',
        { headers },
      );

      expect(agents.body.agents.find(({ slug }) => slug === agentSlug)?.models).toEqual([
        'test/allowed',
      ]);
    });

    it('lets only a signed-in session change limits, checked against the owner', async () => {
      const above = await mintKey({ monthlyBudget: 60 });

      expect(above.status).toBe(400);
      expect(above.body.error).toContain('monthly budget of $50.00.');

      const key = await mintKey({ monthlyBudget: 25 });
      const headers = { 'x-service-key': key.body.token };
      const raised = await booted.restClient.patch(
        `/api/credentials/${key.body.id}`,
        { monthlyBudget: 40 },
        { headers },
      );

      expect(raised.status).toBe(403);

      await booted.frogbot.update({
        collection: 'accounts',
        id: ownerId,
        data: { monthlyBudget: 10 },
        overrideAccess: true,
      });

      const renamed = await booted.restClient.patch(
        `/api/credentials/${key.body.id}`,
        { name: 'Renamed' },
        { headers: session },
      );

      expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
      expect((await complete(key.body.token)).status).toBe(200);

      const stored = await booted.frogbot.findByID({
        collection: 'credentials',
        id: key.body.id,
        overrideAccess: true,
      });

      expect(stored).toMatchObject({ name: 'Renamed', monthlyBudget: 25 });
      expect(stored.lastUsedAt).toEqual(expect.any(String));
    });

    it('refuses a key models value that is not a list', async () => {
      const minted = await mintKey({ models: 'test/blocked' });

      expect(minted.status, JSON.stringify(minted.body)).toBe(400);

      const key = await mintKey({ models: ['test/allowed'] });
      const patched = await booted.restClient.patch(
        `/api/credentials/${key.body.id}`,
        { models: 'test/blocked' },
        { headers: session },
      );

      expect(patched.status, JSON.stringify(patched.body)).toBe(400);

      const stored = await booted.frogbot.findByID({
        collection: 'credentials',
        id: key.body.id,
        overrideAccess: true,
      });

      expect(stored.models).toEqual(['test/allowed']);
    });

    it('refuses a key cap that is not a number, with and without an owner budget', async () => {
      for (const ownerBudget of [50, null]) {
        await booted.frogbot.update({
          collection: 'accounts',
          id: ownerId,
          data: { monthlyBudget: ownerBudget },
          overrideAccess: true,
        });

        for (const monthlyBudget of [true, false, 'abc']) {
          const minted = await mintKey({ monthlyBudget });

          expect(minted.status, `${ownerBudget} ${String(monthlyBudget)}`).toBe(400);
          expect(JSON.stringify(minted.body)).toContain('Please enter a valid number.');
        }
      }
    });

    it('adds request and agent run cost to key and owner, resets both and keeps limits on rotation', async () => {
      const key = await mintKey({ models: ['test/allowed'], monthlyBudget: 25 });

      expect((await complete(key.body.token)).status).toBe(200);

      await vi.waitFor(async () => expect(await spendOf('credentials', key.body.id)).toBe(3));

      expect(await spendOf('accounts', ownerId)).toBe(3);

      const chat = await booted.frogbot.create({
        collection: 'chats',
        data: { agent: agentSlug, user: ownerId, title: 'Key spend' },
        overrideAccess: true,
      });

      const run = await booted.restClient.post(
        `/api/agents/${agentSlug}`,
        { prompt: 'Hello', chatId: chat.id },
        { headers: { 'x-service-key': key.body.token } },
      );

      expect(run.status, JSON.stringify(run.body)).toBe(200);
      expect(modelCalls).toEqual(['allowed', 'allowed']);

      const spent = 6;

      await vi.waitFor(async () => {
        expect(await spendOf('credentials', key.body.id)).toBe(spent);
        expect(await spendOf('accounts', ownerId)).toBe(spent);
      });

      const rotated = await booted.restClient.post<{ id: number | string }>(
        `/api/credentials/${key.body.id}/rotate`,
        undefined,
        { headers: session },
      );

      expect(rotated.status).toBe(201);
      expect(
        await booted.frogbot.findByID({
          collection: 'credentials',
          id: rotated.body.id,
          overrideAccess: true,
        }),
      ).toMatchObject({ models: ['test/allowed'], monthlyBudget: 25, spendThisPeriodUSD: spent });

      await booted.payload.jobs.queue({
        task: 'plugin-ai-policy-reset-spend',
        input: {},
        overrideAccess: true,
      });

      await booted.payload.jobs.run({ queue: 'default', overrideAccess: true });

      expect(await spendOf('credentials', rotated.body.id)).toBe(0);
      expect(await spendOf('accounts', ownerId)).toBe(0);
    });
  });
});
