import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createResend } from '@frogbotai/piece-resend';
import type { AgentModelId, FrogbotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import { Frogbot } from 'frogbot/test';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startPieceProviders, startPieceServer } from './nativePieceServers.js';

type PieceUser = { id: string | number; token: string; connectionId?: string | number };
type PiecePart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  text?: string;
};
type PieceMessage = { role: string; parts: PiecePart[] };

const mail = createResend({ slug: 'mail', auth: { apiKey: 'factory-key' } });
const required = createResend({ slug: 'required' });
const detachedSend = mail.send;
const emailInput = (subject: string) => ({
  to: ['recipient@example.com'],
  from_name: 'Native Piece',
  from: 'sender@example.com',
  subject,
  content_type: 'text' as const,
  content: 'Native piece E2E',
});

describe('native piece e2e — authenticated direct and agent execution', () => {
  let frogbot: FrogbotInstance;
  let providers: Awaited<ReturnType<typeof startPieceProviders>>;
  let server: Awaited<ReturnType<typeof startPieceServer>>;
  let dataDir: string;
  let alice: PieceUser;
  let bob: PieceUser;
  let unconnected: PieceUser;
  const blockedRequests: string[] = [];

  async function request({ path, user, body }: { path: string; user?: PieceUser; body?: unknown }) {
    return fetch(`${server.url}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(user ? { authorization: `Bearer ${user.token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
  }

  async function createUser(name: string): Promise<PieceUser> {
    const credentials = { email: `${name}@native-piece.test`, password: 'native-piece-password' };
    const doc = await frogbot.create({ collection: 'users' as never, data: credentials as never });
    const login = await request({ path: '/users/login', body: credentials });
    const body = await login.json();
    expect(login.status, JSON.stringify(body)).toBe(200);
    expect(body.token).toEqual(expect.any(String));
    return { id: doc.id, token: body.token };
  }

  async function saveConnection({
    user,
    credentials,
    data = {},
  }: {
    user: PieceUser;
    credentials: unknown;
    data?: Record<string, unknown>;
  }) {
    const encryptedCredentials = await frogbot.config.connections.encryption.encrypt(
      JSON.stringify(credentials),
    );
    const values = {
      owner: user.id,
      services: ['resend'],
      source: 'secret',
      sourceKey: 'native-resend',
      credentialType: 'custom',
      encryptedCredentials,
      status: 'active',
      expiresAt: null,
      ...data,
    };
    const doc = user.connectionId
      ? await frogbot.update({
          collection: 'linked-accounts' as never,
          id: user.connectionId,
          data: values,
        })
      : await frogbot.create({ collection: 'linked-accounts' as never, data: values as never });
    user.connectionId = doc.id;
    return encryptedCredentials;
  }

  async function direct({
    user,
    input,
    instance = 'mail',
  }: {
    user?: PieceUser;
    input: unknown;
    instance?: 'mail' | 'required';
  }) {
    const response = await request({ path: `/piece-test/${instance}`, user, body: input });
    return { status: response.status, body: await response.json() };
  }

  async function agent({
    user,
    input,
    instance = 'mail',
  }: {
    user: PieceUser;
    input: unknown;
    instance?: 'mail' | 'required';
  }) {
    const chat = await request({
      path: '/chats',
      user,
      body: { title: 'Native piece E2E', agent: instance },
    });
    const chatBody = await chat.json();
    expect(chat.status, JSON.stringify(chatBody)).toBe(201);
    const chatId = chatBody.doc.id as string | number;
    const response = await request({
      path: `/agents/${instance}`,
      user,
      body: { prompt: JSON.stringify(input), chatId },
    });
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.chatId).toBe(chatId);
    const transcript = await request({
      path: `/messages?where[chat][equals]=${chatId}&sort=createdAt`,
      user,
    });
    expect(transcript.status).toBe(200);
    const messages = (await transcript.json()).docs as PieceMessage[];
    expect(messages.map(({ role }) => role)).toEqual(['user', 'assistant']);
    const assistant = messages.find(({ role }) => role === 'assistant')!;
    const parts = assistant.parts.filter(({ type }) => type === `tool-${instance}_send`);
    expect(parts).toHaveLength(1);
    expect(assistant.parts).toContainEqual({ type: 'text', state: 'done', text: body.text });
    return { body, chatId, part: parts[0]! };
  }

  async function sendBoth({
    user,
    input,
  }: {
    user: PieceUser;
    input: ReturnType<typeof emailInput>;
  }) {
    const result = await direct({ user, input });
    expect(result).toMatchObject({
      status: 200,
      body: { status: 200, body: { id: `email-${input.subject}` } },
    });
    const generated = await agent({ user, input });
    expect(generated.part).toMatchObject({
      state: 'output-available',
      output: { status: 200, body: result.body.body },
    });
    return generated;
  }

  beforeAll(async () => {
    providers = await startPieceProviders();
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', ((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.origin === 'https://api.resend.com') {
        const redirected = new URL(`${url.pathname}${url.search}`, providers.url);
        return nativeFetch(
          input instanceof Request ? new Request(redirected, input) : redirected,
          init,
        );
      }
      if (url.origin !== providers.url && url.origin !== server?.url) {
        blockedRequests.push(url.origin);
        throw new Error(`External network is disabled in native piece E2E: ${url.origin}`);
      }
      return nativeFetch(input, init);
    }) satisfies typeof fetch);

    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-native-piece-'));
    const config = await buildConfig({
      secret: 'native-piece-e2e-secret',
      telemetry: false,
      db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'piece.db')}` } }),
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'linked-accounts', connections: true, fields: [] },
      ],
      ai: {
        providers: {
          local: {
            type: 'openai-compatible',
            baseUrl: `${providers.url}/v1`,
            models: [{ id: 'piece-e2e', mode: 'chat' }],
          },
        },
      },
      agents: [
        {
          slug: 'mail',
          model: 'local/piece-e2e' as AgentModelId,
          instructions: 'Send the supplied email, then report the tool result.',
          tools: [mail.send],
        },
        {
          slug: 'required',
          model: 'local/piece-e2e' as AgentModelId,
          instructions: 'Send the supplied email, then report the tool result.',
          tools: [required],
        },
      ],
      endpoints: [
        {
          path: '/piece-test/:instance',
          method: 'post',
          handler: async (req) => {
            if (!req.user)
              return Response.json({ error: 'Authentication required' }, { status: 401 });
            const send = req.routeParams?.instance === 'required' ? required.send : detachedSend;
            try {
              return Response.json(await send({ input: await req.json!(), req }));
            } catch (error) {
              if (!(error instanceof Error)) throw error;
              return Response.json(
                {
                  error: error.message,
                  name: error.name,
                  ...('code' in error ? { code: error.code } : {}),
                },
                { status: 422 },
              );
            }
          },
        },
      ],
    });
    frogbot = await new Frogbot().init({ config });
    const app = new Hono();
    app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));
    server = await startPieceServer(app);
    alice = await createUser('alice');
    bob = await createUser('bob');
    unconnected = await createUser('unconnected');
  });

  beforeEach(async () => {
    providers.requests.model.length = 0;
    providers.requests.resend.length = 0;
    providers.failures.clear();
    providers.pauses.clear();
    await saveConnection({ user: alice, credentials: { apiKey: 'alice-key' } });
    await saveConnection({ user: bob, credentials: { apiKey: 'bob-key' } });
  });

  afterEach(() => {
    expect(blockedRequests).toEqual([]);
    expect(providers.requests.unexpected).toEqual([]);
  });

  afterAll(async () => {
    try {
      const results = await Promise.allSettled([
        server?.close(),
        frogbot?.destroy(),
        providers?.close(),
      ]);
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
      }
    } finally {
      vi.unstubAllGlobals();
      if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('round-trips a detached action and an agent tool through the same native contract', async () => {
    const input = emailInput('parity');
    const result = await direct({ user: alice, input });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 200, body: { id: 'email-parity' } });
    const generated = await agent({ user: alice, input });
    expect(generated.part).toMatchObject({
      state: 'output-available',
      input,
      output: { status: 200, body: result.body.body },
    });
    expect(generated.body.text).toContain('email-parity');
    expect(providers.requests.resend).toEqual([
      {
        authorization: 'Bearer alice-key',
        contentType: 'application/json',
        body: {
          to: input.to,
          from: 'Native Piece <sender@example.com>',
          reply_to: input.from,
          subject: input.subject,
          text: input.content,
        },
      },
      providers.requests.resend[0],
    ]);
    expect(providers.requests.model).toHaveLength(2);
    expect(providers.requests.model[0]?.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({
          name: 'mail_send',
          parameters: expect.objectContaining({
            required: expect.arrayContaining(['to', 'from', 'subject', 'content']),
          }),
        }),
      }),
    ]);
    expect(providers.requests.model[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'native-send-call',
      content: expect.stringContaining('email-parity'),
    });
  });

  it('isolates concurrent users and keeps their transcripts and credentials private', async () => {
    const [, bobResult] = await Promise.all([
      sendBoth({ user: alice, input: emailInput('alice-concurrent') }),
      sendBoth({ user: bob, input: emailInput('bob-concurrent') }),
    ]);
    expect(providers.requests.resend).toHaveLength(4);
    for (const { authorization, body } of providers.requests.resend) {
      expect(authorization).toBe(`Bearer ${String(body.subject).split('-')[0]}-key`);
    }
    const chats = await request({ path: '/chats?limit=100', user: alice });
    expect(chats.status).toBe(200);
    const docs = (await chats.json()).docs as Array<{ user: { id: string | number } }>;
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every(({ user }) => user.id === alice.id)).toBe(true);
    const foreignChat = await request({ path: `/chats/${bobResult.chatId}`, user: alice });
    expect([403, 404]).toContain(foreignChat.status);
    const foreignMessages = await request({
      path: `/messages?where[chat][equals]=${bobResult.chatId}`,
      user: alice,
    });
    expect(foreignMessages.status).toBe(200);
    expect((await foreignMessages.json()).docs).toEqual([]);
    const connections = await request({ path: '/linked-accounts', user: alice });
    const body = await connections.json();
    expect(connections.status).toBe(200);
    expect(body.docs).toHaveLength(1);
    expect(body.docs[0]).toMatchObject({ id: alice.connectionId, owner: { id: alice.id } });
    expect(body.docs[0]).not.toHaveProperty('encryptedCredentials');
    expect(JSON.stringify(body)).not.toContain('alice-key');
    expect(JSON.stringify(body)).not.toContain('bob-key');
  });

  it('replaces a warmed client after credential rotation without changing another user', async () => {
    await sendBoth({ user: alice, input: emailInput('warm') });
    const encrypted = await saveConnection({ user: alice, credentials: { apiKey: 'rotated-key' } });
    expect(encrypted).not.toContain('rotated-key');
    await sendBoth({ user: alice, input: emailInput('rotated') });
    await sendBoth({ user: bob, input: emailInput('unchanged-bob') });
    expect(providers.requests.resend.map(({ authorization }) => authorization)).toEqual([
      'Bearer alice-key',
      'Bearer alice-key',
      'Bearer rotated-key',
      'Bearer rotated-key',
      'Bearer bob-key',
      'Bearer bob-key',
    ]);
  });

  it('uses factory auth only for an owner without a connection', async () => {
    const input = emailInput('factory');
    expect((await direct({ user: unconnected, input })).status).toBe(200);
    expect((await agent({ user: unconnected, input })).part.state).toBe('output-available');
    expect(providers.requests.resend.map(({ authorization }) => authorization)).toEqual([
      'Bearer factory-key',
      'Bearer factory-key',
    ]);
    const missing = await direct({ user: unconnected, input, instance: 'required' });
    expect(missing).toMatchObject({
      status: 422,
      body: { name: 'ConnectionError', code: 'missing' },
    });
    const generated = await agent({ user: unconnected, input, instance: 'required' });
    expect(generated.part).toMatchObject({
      state: 'output-error',
      errorText: 'An error occurred.',
    });
    expect(generated.body.text).toContain("No connection found for 'resend'.");
    expect(providers.requests.resend).toHaveLength(2);
  });

  it('keeps an in-flight request on its original credential while new calls use the rotated key', async () => {
    let release!: () => void;
    providers.pauses.set(
      'in-flight',
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const pending = direct({ user: alice, input: emailInput('in-flight') });
    try {
      await expect.poll(() => providers.requests.resend.length).toBe(1);
      expect(providers.requests.resend[0]?.authorization).toBe('Bearer alice-key');
      await saveConnection({ user: alice, credentials: { apiKey: 'rotated-key' } });
      await sendBoth({ user: alice, input: emailInput('after-rotation') });
      expect(providers.requests.resend.map(({ authorization }) => authorization)).toEqual([
        'Bearer alice-key',
        'Bearer rotated-key',
        'Bearer rotated-key',
      ]);
    } finally {
      release();
      expect(await pending).toMatchObject({
        status: 200,
        body: { body: { id: 'email-in-flight' } },
      });
    }
  });

  it('expands a whole piece instance and resolves its canonical piece credentials', async () => {
    const result = await agent({
      user: alice,
      input: emailInput('whole-instance'),
      instance: 'required',
    });
    expect(result.part).toMatchObject({
      state: 'output-available',
      output: { body: { id: 'email-whole-instance' } },
    });
    const tools = providers.requests.model[0]?.tools ?? [];
    expect(tools).toHaveLength(22);
    expect(new Set(tools.map(({ function: tool }) => tool.name)).size).toBe(22);
    expect(tools.every(({ function: tool }) => tool.name.startsWith('required_'))).toBe(true);
    expect(providers.requests.resend[0]?.authorization).toBe('Bearer alice-key');
  });

  it.each(
    [
      { label: 'revoked', code: 'revoked', data: { status: 'revoked', encryptedCredentials: '' } },
      { label: 'error state', code: 'error', data: { status: 'error' } },
      { label: 'expired', code: 'expired', data: { expiresAt: '2000-01-01T00:00:00.000Z' } },
      {
        label: 'corrupt ciphertext',
        code: 'error',
        data: { encryptedCredentials: 'not-encrypted' },
      },
      {
        label: 'invalid auth shape',
        code: 'error',
        data: {},
        credentials: { wrongField: 'not-an-api-key' },
      },
    ].map((scenario) => ({ credentials: { apiKey: 'alice-key' }, ...scenario })),
  )(
    'rejects $label credentials after warming the client, without factory fallback',
    async ({ code, data, credentials }) => {
      const input = emailInput('invalid-connection');
      await sendBoth({ user: alice, input });
      await saveConnection({ user: alice, credentials, data });
      const result = await direct({ user: alice, input });
      expect(result).toMatchObject({ status: 422, body: { name: 'ConnectionError', code } });
      const generated = await agent({ user: alice, input });
      expect(generated.part).toMatchObject({
        state: 'output-error',
        errorText: 'An error occurred.',
      });
      expect(generated.body.text).toContain(result.body.error);
      expect(providers.requests.resend).toHaveLength(2);
    },
  );

  it('rejects invalid action input before any vendor request on either path', async () => {
    const input = { ...emailInput('invalid-input'), content_type: 'unsupported' };
    const result = await direct({ user: alice, input });
    expect(result).toMatchObject({ status: 422, body: { name: 'ZodError' } });
    const generated = await agent({ user: alice, input });
    expect(generated.part.state).toBe('output-error');
    expect(generated.part.errorText).toBe('An error occurred.');
    expect(generated.body.text).toContain('content_type');
    expect(providers.requests.resend).toEqual([]);
  });

  it.each([401, 429, 500] as const)(
    'propagates provider HTTP %s and recovers on the next invocation',
    async (status) => {
      const input = emailInput(`provider-${status}`);
      providers.failures.set(input.subject, { status, message: 'Fixture provider failure' });
      const result = await direct({ user: alice, input });
      const error = `Resend request failed (${status}): Fixture provider failure`;
      expect(result).toMatchObject({ status: 422, body: { error } });
      const generated = await agent({ user: alice, input });
      expect(generated.part).toMatchObject({
        state: 'output-error',
        errorText: 'An error occurred.',
      });
      expect(generated.body.text).toContain(error);
      expect(providers.requests.resend).toHaveLength(2);
      providers.failures.delete(input.subject);
      expect((await direct({ user: alice, input })).status).toBe(200);
      expect((await agent({ user: alice, input })).part.state).toBe('output-available');
      expect(providers.requests.resend).toHaveLength(4);
    },
  );

  it('rejects anonymous execution before contacting either external service', async () => {
    const input = emailInput('anonymous');
    expect((await direct({ input })).status).toBe(401);
    const response = await request({
      path: '/agents/mail',
      body: { prompt: JSON.stringify(input) },
    });
    expect(response.status).toBe(403);
    expect(providers.requests.model).toEqual([]);
    expect(providers.requests.resend).toEqual([]);
  });
});
