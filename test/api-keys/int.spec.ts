import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAPHQL_POST } from '@frogbotai/next/routes';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import config, { agentSlug, upstreamPort } from './config.js';
import type { Account } from './frogbot-types.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const writeSpend = (
  booted: BootedFrogBot,
  collection: 'accounts' | 'credentials',
  id: number | string,
  amount: number,
) =>
  booted.frogbot.update({
    collection: 'plugin-ai-policy-spend',
    where: { key: { equals: `${collection}:${String(id)}` } },
    data: { amount },
    overrideAccess: true,
  });

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

    expect(rejected.status).toBe(401);
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
    expect(minted.body.error).toMatch(/can't mint or rotate/);

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

  it('lets a canMint key mint keys inside its own limits, recording itself as mintedBy', async () => {
    await createOwner();
    const login = await booted.restClient.post<{ token: string }>(
      '/api/accounts/login',
      credentials,
    );

    const parent = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name: 'CLI', data: { canMint: true, models: ['test/allowed'], monthlyBudget: 5 } },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    expect(parent.status).toBe(201);

    const parentHeaders = { 'x-service-key': parent.body.token };
    const child = await booted.restClient.post<{ id: number | string; token: string }>(
      '/api/credentials/mint',
      { name: 'CI' },
      { headers: parentHeaders },
    );

    expect(child.status).toBe(201);

    const stored = await booted.frogbot.findByID({
      collection: 'credentials',
      id: child.body.id,
      depth: 0,
      overrideAccess: true,
    });

    expect(stored).toMatchObject({
      canMint: false,
      mintedBy: parent.body.id,
      models: ['test/allowed'],
      monthlyBudget: 5,
    });

    const wider = await booted.restClient.post<{ error: string }>(
      '/api/credentials/mint',
      { name: 'Wide', data: { monthlyBudget: 50 } },
      { headers: parentHeaders },
    );

    expect(wider.status).toBe(400);
    expect(wider.body.error).toContain('Can\'t exceed API key "CLI"\'s monthly cap of $5.00.');

    const grandchild = await booted.restClient.post<{ error: string }>(
      '/api/credentials/mint',
      { name: 'Deeper' },
      { headers: { 'x-service-key': child.body.token } },
    );

    expect(grandchild.status).toBe(403);

    const sibling = await booted.restClient.post<{ id: number | string }>(
      '/api/credentials/mint',
      { name: 'Wide sibling', data: { monthlyBudget: 50 } },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    expect(sibling.status, JSON.stringify(sibling.body)).toBe(201);

    const rotatedSibling = await booted.restClient.post(
      `/api/credentials/${sibling.body.id}/rotate`,
      undefined,
      { headers: parentHeaders },
    );

    expect(rotatedSibling.status, JSON.stringify(rotatedSibling.body)).toBe(404);
    expect(
      await booted.frogbot.findByID({
        collection: 'credentials',
        id: sibling.body.id,
        depth: 0,
        overrideAccess: true,
      }),
    ).toMatchObject({ revokedAt: null });

    const rotatedChild = await booted.restClient.post<{ mintedBy: number | string }>(
      `/api/credentials/${child.body.id}/rotate`,
      undefined,
      { headers: parentHeaders },
    );

    expect(rotatedChild.status).toBe(201);
    expect(rotatedChild.body.mintedBy).toBe(parent.body.id);
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

    await writeSpend(booted, 'accounts', owner.id, 10);

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
      writeSpend(booted, collection, id, spend);

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

    const setOwnerModels = (models: NonNullable<Account['models']>) =>
      booted.frogbot.update({
        collection: 'accounts',
        id: ownerId,
        data: { models },
        overrideAccess: true,
      });

    const listModels = async (headers: Record<string, string>) => {
      const response = await booted.restClient.get<{ object: string; data: { id: string }[] }>(
        '/api/v1/models',
        { headers },
      );

      expect(response.status).toBe(200);
      expect(response.body.object).toBe('list');

      return response.body.data.map(({ id }) => id).sort();
    };

    it('lists only the models a user may use', async () => {
      await setOwnerModels(['openai/gpt-4.1', 'openai/gpt-4.1-mini']);

      expect(await listModels(session)).toEqual(['openai/gpt-4.1', 'openai/gpt-4.1-mini']);
    });

    it("lists only an API key's models", async () => {
      await setOwnerModels(['openai/gpt-4.1', 'openai/gpt-4.1-mini']);

      const key = await mintKey({ models: ['openai/gpt-4.1'] });

      expect(key.status, JSON.stringify(key.body)).toBe(201);
      expect(await listModels({ 'x-service-key': key.body.token })).toEqual(['openai/gpt-4.1']);
    });

    it('lists every configured model for a user with no models list', async () => {
      await setOwnerModels([]);

      expect(await listModels(session)).toEqual([
        'openai/gpt-4.1',
        'openai/gpt-4.1-mini',
        'openai/gpt-4o',
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

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(Date.now() + 32 * 24 * 60 * 60 * 1000));

      await booted.payload.jobs.queue({
        task: 'plugin-ai-policy-reset-spend',
        input: {},
        overrideAccess: true,
      });

      await booted.payload.jobs.run({ queue: 'default', overrideAccess: true });

      vi.useRealTimers();

      expect(await spendOf('credentials', rotated.body.id)).toBe(0);
      expect(await spendOf('accounts', ownerId)).toBe(0);
    });
  });

  describe('keys minted by keys', () => {
    const minterCredentials = {
      email: 'api-key-minter@frogbot.local',
      password: 'frogbot-test-password',
    };

    type Minted = { id: number | string; token: string; mintedBy?: unknown; error?: string };

    let ownerId: Account['id'];
    let session: { Authorization: string };

    beforeEach(async () => {
      modelCalls.length = 0;

      const owner = await booted.frogbot.create({
        collection: 'accounts',
        data: minterCredentials,
        overrideAccess: true,
      });

      ownerId = owner.id;

      const login = await booted.restClient.post<{ token: string }>(
        '/api/accounts/login',
        minterCredentials,
      );

      session = { Authorization: `JWT ${login.body.token}` };
    });

    const mint = (headers: Record<string, string>, name: string, data?: Record<string, unknown>) =>
      booted.restClient.post<Minted>(
        '/api/credentials/mint',
        { name, ...(data && { data }) },
        { headers },
      );

    const rotate = (headers: Record<string, string>, id: number | string) =>
      booted.restClient.post<Minted>(`/api/credentials/${id}/rotate`, undefined, { headers });

    const revoke = (
      headers: Record<string, string>,
      id: number | string,
      body?: { cascade?: unknown },
    ) => booted.restClient.post(`/api/credentials/${id}/revoke`, body, { headers });

    const mintedCount = (headers: Record<string, string>, id: number | string) =>
      booted.restClient.get<{ count: number }>(`/api/credentials/${id}/minted-count`, {
        headers,
      });

    const asKey = (token: string) => ({ 'x-service-key': token });

    const stored = (id: number | string) =>
      booted.frogbot.findByID({ collection: 'credentials', id, depth: 0, overrideAccess: true });

    const active = async () =>
      (
        await booted.frogbot.find({
          collection: 'credentials',
          depth: 0,
          overrideAccess: true,
          pagination: false,
          where: { revokedAt: { exists: false } },
        })
      ).docs.map((doc) => doc.id);

    const setSpend = (id: number | string, spend: number) =>
      writeSpend(booted, 'credentials', id, spend);

    const complete = (token: string) =>
      booted.restClient.post<{ error: { message: string } }>(
        '/api/v1/chat/completions',
        { model: 'test/allowed', messages: [{ role: 'user', content: 'Hello' }] },
        { headers: asKey(token) },
      );

    it('refuses a child with models outside the parent list', async () => {
      const parent = await mint(session, 'P', { canMint: true, models: ['test/allowed'] });
      const child = await mint(asKey(parent.body.token), 'C', { models: ['test/blocked'] });

      expect(child.status, JSON.stringify(child.body)).toBe(400);
    });

    it('keeps a grandchild inside the grandparent cap, through a canMint child', async () => {
      const parent = await mint(session, 'P', { canMint: true, monthlyBudget: 5 });
      const child = await mint(asKey(parent.body.token), 'C', { canMint: true });

      expect(child.status, JSON.stringify(child.body)).toBe(201);
      expect(await stored(child.body.id)).toMatchObject({ canMint: true, monthlyBudget: 5 });

      const grandchild = await mint(asKey(child.body.token), 'G', { monthlyBudget: 50 });

      expect(grandchild.status, JSON.stringify(grandchild.body)).toBe(400);

      const unlimited = await mint(asKey(child.body.token), 'G2', { monthlyBudget: null });

      expect(unlimited.status, JSON.stringify(unlimited.body)).toBe(201);
      expect(await stored(unlimited.body.id)).toMatchObject({ monthlyBudget: 5 });
    });

    it('mints for the key owner only, ignoring owner, mintedBy and spend in data', async () => {
      const other = await booted.frogbot.create({
        collection: 'accounts',
        data: { email: 'api-key-other@frogbot.local', password: 'frogbot-test-password' },
        overrideAccess: true,
      });

      const parent = await mint(session, 'P', { canMint: true, monthlyBudget: 5 });
      const child = await mint(asKey(parent.body.token), 'C', {
        owner: other.id,
        mintedBy: null,
        spendThisPeriodUSD: -100,
        revokedAt: null,
      });

      expect(child.status, JSON.stringify(child.body)).toBe(201);
      expect(await stored(child.body.id)).toMatchObject({
        owner: ownerId,
        mintedBy: parent.body.id,
        spendThisPeriodUSD: 0,
      });
    });

    it('refuses to mint with a revoked canMint parent', async () => {
      const parent = await mint(session, 'P', { canMint: true });

      await revoke(session, parent.body.id);

      expect([401, 403]).toContain((await mint(asKey(parent.body.token), 'C')).status);
    });

    it('refuses REST create and ignores PATCH of canMint and mintedBy', async () => {
      const created = await booted.restClient.post(
        '/api/credentials',
        { name: 'raw', canMint: true, prefix: 'x', tokenHash: 'y', owner: ownerId },
        { headers: session },
      );

      expect(created.status).toBe(403);

      const plain = await mint(session, 'Plain');
      const parent = await mint(session, 'P', { canMint: true });

      await booted.restClient.patch(
        `/api/credentials/${plain.body.id}`,
        { canMint: true, mintedBy: parent.body.id },
        { headers: session },
      );

      await booted.restClient.patch(
        `/api/credentials/${plain.body.id}`,
        { canMint: true },
        { headers: asKey(plain.body.token) },
      );

      expect(await stored(plain.body.id)).toMatchObject({ canMint: false, mintedBy: null });
      expect((await mint(asKey(plain.body.token), 'X')).status).toBe(403);
    });

    it('refuses a parent key widening its child through PATCH', async () => {
      const parent = await mint(session, 'P', { canMint: true, monthlyBudget: 5 });
      const child = await mint(asKey(parent.body.token), 'C');
      const widened = await booted.restClient.patch(
        `/api/credentials/${child.body.id}`,
        { monthlyBudget: 500 },
        { headers: asKey(parent.body.token) },
      );

      expect(widened.status).toBe(403);
      expect(await stored(child.body.id)).toMatchObject({ monthlyBudget: 5 });
    });

    it("copies the parent's fields from other plugins, and a key can't change them", async () => {
      const parent = await mint(session, 'P', {
        canMint: true,
        tenant: 'acme',
        environment: 'staging',
      });

      const child = await mint(asKey(parent.body.token), 'C', {
        tenant: 'globex',
        environment: 'production',
      });

      expect(child.status, JSON.stringify(child.body)).toBe(201);
      expect(await stored(child.body.id)).toMatchObject({
        tenant: 'acme',
        environment: 'staging',
      });

      for (const id of [parent.body.id, child.body.id]) {
        const widened = await booted.restClient.patch<{ errors: { message: string }[] }>(
          `/api/credentials/${id}`,
          { tenant: 'globex' },
          { headers: asKey(parent.body.token) },
        );

        expect(widened.status).toBe(403);
        expect(widened.body.errors[0]?.message).toBe(
          'API key "P" can\'t change "tenant" on a key. Sign in to change it.',
        );
      }

      const renamed = await booted.restClient.patch(
        `/api/credentials/${child.body.id}`,
        { name: 'C2', tenant: 'acme' },
        { headers: asKey(parent.body.token) },
      );

      expect(renamed.status).toBe(200);

      const bySession = await booted.restClient.patch(
        `/api/credentials/${child.body.id}`,
        { tenant: 'globex' },
        { headers: session },
      );

      expect(bySession.status).toBe(200);
      expect(await stored(child.body.id)).toMatchObject({ name: 'C2', tenant: 'globex' });
    });

    it('keeps monthly spend when a key is rotated by a session or by itself', async () => {
      const parent = await mint(session, 'P', { canMint: true, monthlyBudget: 5 });

      await setSpend(parent.body.id, 5);

      const bySession = await rotate(session, parent.body.id);

      expect(bySession.status, JSON.stringify(bySession.body)).toBe(201);
      expect((await stored(bySession.body.id)).spendThisPeriodUSD).toBe(5);

      const byKey = await rotate(asKey(bySession.body.token), bySession.body.id);

      expect(byKey.status, JSON.stringify(byKey.body)).toBe(201);
      expect((await stored(byKey.body.id)).spendThisPeriodUSD).toBe(5);
      expect((await complete(byKey.body.token)).status).toBe(403);
    });

    it('keeps the lineage and the minted keys when a minted key rotates itself', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const child = await mint(asKey(parent.body.token), 'C', { canMint: true });
      const grandchild = await mint(asKey(child.body.token), 'G');
      const rotated = await rotate(asKey(child.body.token), child.body.id);

      expect(rotated.status, JSON.stringify(rotated.body)).toBe(201);
      expect(rotated.body.mintedBy).toBe(parent.body.id);
      expect(await stored(rotated.body.id)).toMatchObject({ mintedBy: parent.body.id });
      expect(await stored(grandchild.body.id)).toMatchObject({
        mintedBy: rotated.body.id,
        revokedAt: null,
      });
      expect(await active()).not.toContain(child.body.id);
    });

    it('leaves the child working when a rotation by its narrowed parent is refused', async () => {
      const parent = await mint(session, 'P', { canMint: true, monthlyBudget: 5 });
      const child = await mint(asKey(parent.body.token), 'C');

      expect(await stored(child.body.id)).toMatchObject({ monthlyBudget: 5 });

      const narrowed = await booted.restClient.patch(
        `/api/credentials/${parent.body.id}`,
        { monthlyBudget: 2 },
        { headers: session },
      );

      expect(narrowed.status, JSON.stringify(narrowed.body)).toBe(200);

      const rotated = await rotate(asKey(parent.body.token), child.body.id);

      expect(rotated.status).toBe(400);
      expect(rotated.body.error).toContain('Can\'t exceed API key "P"\'s monthly cap of $2.00.');
      expect(new Set(await active())).toEqual(new Set([parent.body.id, child.body.id]));
      expect(
        (await booted.restClient.get('/api/credentials', { headers: asKey(child.body.token) }))
          .status,
      ).toBe(200);
    });

    it('refuses a canMint key rotating its grandchild or its parent', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const child = await mint(asKey(parent.body.token), 'C', { canMint: true });
      const grandchild = await mint(asKey(child.body.token), 'G');

      expect((await rotate(asKey(child.body.token), parent.body.id)).status).toBe(404);
      expect((await rotate(asKey(parent.body.token), grandchild.body.id)).status).toBe(404);
      expect(await active()).toEqual(
        expect.arrayContaining([parent.body.id, child.body.id, grandchild.body.id]),
      );
    });

    it('answers a missing key on revoke, minted-count and rotate with the errors envelope', async () => {
      const notFound = {
        errors: [{ name: 'APIError', message: 'API key not found', data: { code: 'not_found' } }],
      };

      for (const response of [
        await revoke(session, 999_999),
        await mintedCount(session, 999_999),
        await rotate(session, 999_999),
      ]) {
        expect(response.status).toBe(404);
        expect(response.body).toEqual(notFound);
      }
    });

    it('lets a key revoke only itself and the keys it minted', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const sibling = await mint(session, 'S');
      const child = await mint(asKey(parent.body.token), 'C', { canMint: true });
      const grandchild = await mint(asKey(child.body.token), 'G');

      for (const id of [sibling.body.id, parent.body.id]) {
        const refused = await revoke(asKey(child.body.token), id);

        expect(refused.status).toBe(404);
        expect(refused.body).toEqual({
          errors: [
            {
              name: 'APIError',
              message:
                'A key can revoke or rotate only itself and the keys it minted. Sign in to manage this key.',
              data: { code: 'not_found' },
            },
          ],
        });
        expect((await mintedCount(asKey(child.body.token), id)).status).toBe(404);
      }

      expect((await revoke(asKey(parent.body.token), grandchild.body.id)).status).toBe(404);
      expect(new Set(await active())).toEqual(
        new Set([parent.body.id, sibling.body.id, child.body.id, grandchild.body.id]),
      );

      expect((await mintedCount(asKey(parent.body.token), child.body.id)).body).toEqual({
        count: 1,
      });
      expect((await revoke(asKey(parent.body.token), child.body.id)).status).toBe(200);
      expect(new Set(await active())).toEqual(new Set([parent.body.id, sibling.body.id]));
      expect((await revoke(asKey(parent.body.token), parent.body.id)).status).toBe(200);
    });

    it("lets a signed-in session revoke any of its owner's keys", async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const sibling = await mint(session, 'S');
      const child = await mint(asKey(parent.body.token), 'C');

      expect((await revoke(session, sibling.body.id)).status).toBe(200);
      expect((await revoke(session, parent.body.id)).status).toBe(200);
      expect(await active()).toEqual([]);
      expect(await stored(child.body.id)).toMatchObject({ revokedAt: expect.any(String) });
    });

    it('revokes every key a revoked key minted, all the way down', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const child = await mint(asKey(parent.body.token), 'C', { canMint: true });
      const grandchild = await mint(asKey(child.body.token), 'G');
      const sibling = await mint(session, 'S');

      expect((await revoke(session, parent.body.id)).status).toBe(200);
      expect(await active()).toEqual([sibling.body.id]);

      for (const token of [child.body.token, grandchild.body.token]) {
        expect(
          (await booted.restClient.get('/api/credentials', { headers: asKey(token) })).status,
        ).toBe(401);
      }
    });

    it('keeps the keys a key made when revoked with cascade false, and a later revoke above reaches them', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const child = await mint(asKey(parent.body.token), 'C', { canMint: true });
      const grandchild = await mint(asKey(child.body.token), 'G');

      expect((await revoke(session, child.body.id, { cascade: false })).status).toBe(200);
      expect(new Set(await active())).toEqual(new Set([parent.body.id, grandchild.body.id]));
      expect(
        (
          await booted.restClient.get('/api/credentials', {
            headers: asKey(grandchild.body.token),
          })
        ).status,
      ).toBe(200);

      expect((await revoke(session, parent.body.id)).status).toBe(200);
      expect(await active()).toEqual([]);
      expect(await stored(child.body.id)).toMatchObject({ revokedAt: expect.any(String) });
    });

    it.each(['no', null])('refuses a revoke whose cascade is %j', async (cascade) => {
      const parent = await mint(session, 'P', { canMint: true });
      const child = await mint(asKey(parent.body.token), 'C');

      expect((await revoke(session, parent.body.id, { cascade })).status).toBe(400);
      expect(new Set(await active())).toEqual(new Set([parent.body.id, child.body.id]));
    });

    it('refuses a revoke whose body is not JSON', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const child = await mint(asKey(parent.body.token), 'C');
      const response = await fetch(`${booted.baseUrl}/api/credentials/${parent.body.id}/revoke`, {
        method: 'POST',
        headers: { ...session, 'content-type': 'application/json' },
        body: '{"cascade": false',
      });

      expect(response.status).toBe(400);
      expect(new Set(await active())).toEqual(new Set([parent.body.id, child.body.id]));
    });

    it('counts every live key a cascade would revoke, through a key revoked on its own', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const cli = await mint(asKey(parent.body.token), 'K', { canMint: true });
      const child = await mint(asKey(cli.body.token), 'C', { canMint: true });

      expect((await mintedCount(session, parent.body.id)).body).toEqual({ count: 2 });

      await mint(asKey(child.body.token), 'G');
      await revoke(asKey(cli.body.token), cli.body.id, { cascade: false });

      const counted = await mintedCount(session, parent.body.id);
      const before = (await active()).length;

      expect(counted.status).toBe(200);
      expect(counted.body).toEqual({ count: 2 });
      expect((await revoke(session, parent.body.id, { cascade: true })).status).toBe(200);
      expect(before - 1 - (await active()).length).toBe(counted.body.count);
    });

    it("counts only the caller's own keys", async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const other = await createOwner();
      const login = await booted.restClient.post<{ token: string }>(
        '/api/accounts/login',
        credentials,
      );

      expect(other.id).not.toBe(ownerId);
      expect(
        (await mintedCount({ Authorization: `JWT ${login.body.token}` }, parent.body.id)).status,
      ).toBe(404);
      expect(
        (await booted.restClient.get(`/api/credentials/${parent.body.id}/minted-count`)).status,
      ).toBe(401);
    });

    it('stamps the keys a re-revoke takes with the time of that revoke', async () => {
      const parent = await mint(session, 'P', { canMint: true });
      const child = await mint(asKey(parent.body.token), 'C');

      const first = '2026-01-01T00:00:00.000Z';

      await revoke(session, parent.body.id, { cascade: false });

      await booted.frogbot.update({
        collection: 'credentials',
        id: parent.body.id,
        data: { revokedAt: first },
        overrideAccess: true,
      });

      const before = new Date().toISOString();

      await revoke(session, parent.body.id);

      expect(((await stored(child.body.id)).revokedAt as string) >= before).toBe(true);
      expect((await stored(parent.body.id)).revokedAt).toBe(first);
    });

    it("counts a key's spend against every key above it", async () => {
      const parent = await mint(session, 'P', { canMint: true, monthlyBudget: 10 });
      const child = await mint(asKey(parent.body.token), 'C', { canMint: true });
      const grandchild = await mint(asKey(child.body.token), 'G');
      const sibling = await mint(asKey(parent.body.token), 'S');

      expect((await complete(grandchild.body.token)).status).toBe(200);
      expect((await complete(sibling.body.token)).status).toBe(200);

      await vi.waitFor(async () => {
        expect((await stored(grandchild.body.id)).spendThisPeriodUSD).toBe(3);
        expect((await stored(child.body.id)).spendThisPeriodUSD).toBe(3);
        expect((await stored(sibling.body.id)).spendThisPeriodUSD).toBe(3);
        expect((await stored(parent.body.id)).spendThisPeriodUSD).toBe(6);
      });

      await setSpend(parent.body.id, 10);

      const capped = await complete(grandchild.body.token);

      expect(capped.status).toBe(403);
      expect(capped.body.error.message).toBe('API key "P" has used its monthly cap of $10.00.');
      expect(modelCalls).toEqual(['allowed', 'allowed']);
    });
  });

  describe('expiring keys', () => {
    type Minted = { id: number | string; token: string; expiresAt?: string | null; error?: string };

    let session: { Authorization: string };

    beforeEach(async () => {
      await createOwner();
      const login = await booted.restClient.post<{ token: string }>(
        '/api/accounts/login',
        credentials,
      );

      session = { Authorization: `JWT ${login.body.token}` };
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const mint = (headers: Record<string, string>, body: Record<string, unknown>) =>
      booted.restClient.post<Minted>('/api/credentials/mint', body, { headers });

    const asKey = (token: string) => ({ 'x-service-key': token });

    const stored = (id: number | string) =>
      booted.frogbot.findByID({ collection: 'credentials', id, depth: 0, overrideAccess: true });

    it('refuses an unreadable or past expiresAt and stores a future one', async () => {
      const unreadable = await mint(session, { name: 'Bad', expiresAt: 'not a date' });
      const past = await mint(session, { name: 'Past', expiresAt: '2020-01-01T00:00:00.000Z' });

      expect(unreadable.status).toBe(400);
      expect(past.status).toBe(400);
      expect(past.body.error).toBe('expiresAt must be in the future.');

      const farFuture = await mint(session, {
        name: 'Far',
        expiresAt: '+099999-01-01T00:00:00.000Z',
      });

      expect(farFuture.status).toBe(400);
      expect(farFuture.body.error).toBe('expiresAt must be before the year 10000.');

      const expiresAt = new Date(Date.now() + 30 * 864e5).toISOString();
      const future = await mint(session, { name: 'Future', expiresAt });

      expect(future.status).toBe(201);
      expect(future.body.expiresAt).toBe(expiresAt);
      expect((await stored(future.body.id)).expiresAt).toBe(expiresAt);

      const undated = await mint(session, { name: 'Forever' });

      expect(undated.body.expiresAt).toBeNull();
      expect((await stored(undated.body.id)).expiresAt ?? null).toBeNull();
    });

    it('refuses impossible calendar dates instead of rolling them into the next month', async () => {
      for (const expiresAt of ['2050-02-30', '2050-02-31T00:00:00.000Z', '2050-04-31']) {
        const refused = await mint(session, { name: 'Feb', expiresAt });

        expect(refused.status, `${expiresAt}: ${JSON.stringify(refused.body)}`).toBe(400);
      }
    });

    it('refuses non-ISO dates, whose meaning depends on the server time zone', async () => {
      for (const expiresAt of [
        '2050-01-01 00:00',
        'January 1, 2050',
        '1/2/2050',
        '2050-01-01T00:00',
      ]) {
        const refused = await mint(session, { name: 'Loose', expiresAt });

        expect(refused.status, `${expiresAt}: ${JSON.stringify(refused.body)}`).toBe(400);
      }
    });

    it('accepts a date-only expiresAt and one with an offset, as UTC instants', async () => {
      const day = await mint(session, { name: 'Day', expiresAt: '2050-02-28' });
      const offset = await mint(session, { name: 'Offset', expiresAt: '2050-01-01T00:00+05:00' });

      expect(day.status).toBe(201);
      expect(day.body.expiresAt).toBe('2050-02-28T00:00:00.000Z');
      expect(offset.status).toBe(201);
      expect(offset.body.expiresAt).toBe('2049-12-31T19:00:00.000Z');
    });

    it('stops a key signing in once its date passes, and refuses to rotate it', async () => {
      const expiresAt = new Date(Date.now() + 864e5).toISOString();
      const key = await mint(session, { name: 'Day pass', expiresAt });

      expect(
        (await booted.restClient.get('/api/credentials', { headers: asKey(key.body.token) }))
          .status,
      ).toBe(200);

      const lastUsedAt = (await stored(key.body.id)).lastUsedAt;

      vi.useFakeTimers({ now: Date.parse(expiresAt) + 1000, toFake: ['Date'] });

      const message = `API key expired at ${expiresAt}. Mint a new one with POST /api/credentials/mint.`;
      const refused = await booted.restClient.get<{ errors: { message: string }[] }>(
        '/api/credentials',
        { headers: asKey(key.body.token) },
      );

      expect(refused.status).toBe(401);
      expect(refused.body.errors[0]?.message).toBe(message);
      expect(refused.headers.get('www-authenticate')).toBe(
        `Bearer error="invalid_token", error_description="${message}"`,
      );

      const refusedMint = await mint(asKey(key.body.token), { name: 'Next' });

      expect(refusedMint.status).toBe(401);
      expect(refusedMint.body.error).toBe(message);
      expect((await stored(key.body.id)).lastUsedAt).toBe(lastUsedAt);

      const login = await booted.restClient.post<{ token: string }>(
        '/api/accounts/login',
        credentials,
      );

      const rotated = await booted.restClient.post<Minted>(
        `/api/credentials/${key.body.id}/rotate`,
        undefined,
        { headers: { Authorization: `JWT ${login.body.token}` } },
      );

      expect(rotated.status).toBe(400);
      expect(rotated.body.error).toBe('This key has expired. Mint a new key instead.');
      expect((await stored(key.body.id)).revokedAt ?? null).toBeNull();
    });

    it('tells a revoked key it was revoked, and when', async () => {
      const key = await mint(session, { name: 'Gone' });

      expect(
        (
          await booted.restClient.post(`/api/credentials/${key.body.id}/revoke`, undefined, {
            headers: session,
          })
        ).status,
      ).toBe(200);

      const revokedAt = (await stored(key.body.id)).revokedAt as string;
      const message = `API key was revoked at ${revokedAt}. Mint a new one with POST /api/credentials/mint.`;
      const refused = await booted.restClient.get<{ errors: { message: string }[] }>(
        '/api/credentials',
        { headers: asKey(key.body.token) },
      );

      expect(refused.status).toBe(401);
      expect(refused.body.errors[0]?.message).toBe(message);
      expect(refused.headers.get('www-authenticate')).toContain(`error_description="${message}"`);
    });

    it('refuses a revoked key on GraphQL instead of returning public data', async () => {
      const key = await mint(session, { name: 'Gone' });

      await booted.restClient.post(`/api/credentials/${key.body.id}/revoke`, undefined, {
        headers: session,
      });

      const response = await GRAPHQL_POST(config)(
        new Request(`${booted.baseUrl}/api/graphql`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...asKey(key.body.token) },
          body: JSON.stringify({ query: '{ Accounts { docs { id } } }' }),
        }),
      );

      const body = (await response.json()) as {
        data?: { Accounts: unknown };
        errors?: { message: string }[];
      };

      expect(body.data?.Accounts ?? null).toBeNull();
      expect(body.errors?.[0]?.message).toMatch(/^API key was revoked at /);
    });

    it('lets a password login through when the request also carries a refused key', async () => {
      const key = await mint(session, { name: 'Gone' });

      await booted.restClient.post(`/api/credentials/${key.body.id}/revoke`, undefined, {
        headers: session,
      });

      const login = await booted.restClient.post('/api/accounts/login', credentials, {
        headers: asKey(key.body.token),
      });

      expect(login.status).toBe(200);
    });

    it('lets a session cookie through when the request also carries a refused key', async () => {
      const key = await mint(session, { name: 'Gone' });

      await booted.restClient.post(`/api/credentials/${key.body.id}/revoke`, undefined, {
        headers: session,
      });

      const both = await booted.restClient.get('/api/credentials', {
        headers: { ...session, ...asKey(key.body.token) },
      });

      expect(both.status).toBe(200);
    });

    it("gives a key minted by a key no later date than its parent's", async () => {
      const parentDate = new Date(Date.now() + 30 * 864e5).toISOString();
      const parent = await mint(session, {
        name: 'Parent',
        expiresAt: parentDate,
        data: { canMint: true },
      });

      const undated = await mint(asKey(parent.body.token), { name: 'Undated' });
      const later = await mint(asKey(parent.body.token), {
        name: 'Later',
        expiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
      });

      expect(undated.status, JSON.stringify(undated.body)).toBe(201);
      expect(undated.body.expiresAt).toBe(parentDate);
      expect(later.body.expiresAt).toBe(parentDate);
      expect((await stored(undated.body.id)).expiresAt).toBe(parentDate);
    });
  });
});
