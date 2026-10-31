import { createHmac } from 'node:crypto';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';

import { createOpenAI as createOpenAIProvider } from '@ai-sdk/openai';
import { createChatGPTMiddleware, createOpenAI } from '@frogbotai/piece-openai';
import { generateText, Output, wrapLanguageModel } from 'ai';
import { createGatewayHandler, type FrogBotRequest } from 'frogbot';
import { getFrogBotPayload } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { completedEvent, failedEvent, textEvents } from '../__helpers/shared/openaiResponses.js';
import { AGENT_SLUG, bootLinked, lookup } from './aiCredentials.js';
import { type FakeOpenAI, json, say, sse, startFakeOpenAI } from './fakeOpenAI.js';

const ORIGIN = 'http://localhost:3000';
const HOST_KEY = 'openai:chatgpt:host';
const USAGE_URL = 'https://chatgpt.com/settings/usage';
const NO_API_ACCESS =
  "A ChatGPT plan can't be used through this app's API. Paste an OpenAI API key in Settings → Linked accounts to use the API.";

const NO_PLAN =
  "ChatGPT didn't allow plan use. Sign in again and allow it, or paste an OpenAI API key instead.";

const INVALID = 'ChatGPT returned an invalid sign-in. Try again.';
const BUSY = 'ChatGPT is busy. Try again in a moment.';
const RECONNECT = 'Reconnect ChatGPT in Settings → Linked accounts.';
const UNSUPPORTED = "This request isn't supported on a ChatGPT plan.";

const REFUSALS: [string, number, string][] = [
  [
    'subscription_sharing_usage_limit_exceeded',
    429,
    `You've reached your ChatGPT plan's usage limit. Manage usage at ${USAGE_URL}.`,
  ],
  [
    'subscription_sharing_user_not_eligible',
    403,
    "This ChatGPT account can't use its plan in other apps. Paste an OpenAI API key in Settings → Linked accounts instead.",
  ],
  ['subscription_sharing_invalid_user', 401, RECONNECT],
  ['chatpass_v2_scope_not_authorized', 403, RECONNECT],
  ['chatpass_v2_invalid_authorization_context', 403, RECONNECT],
  ['subscription_sharing_unsupported_capability', 400, UNSUPPORTED],
  ['subscription_sharing_route_not_supported', 403, UNSUPPORTED],
];

const BUSY_CODES = [
  'subscription_sharing_usage_unavailable',
  'subscription_sharing_user_unavailable',
];

const inProgress = textEvents('x').slice(0, 2);

const errorEvent = (code: string) => ({ type: 'error', code, message: `failed: ${code}` });

type Body = Record<string, unknown>;

describe(`ChatGPT sign-in and plan calls against a fake OpenAI server [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let fake: FakeOpenAI;
  let booted: Awaited<ReturnType<typeof bootLinked>>;
  let alice: FrogBotRequest;
  let dave: FrogBotRequest;
  let bob: FrogBotRequest;
  let carol: FrogBotRequest;

  const endpoint = (method: string, path: string) => {
    const payload = getFrogBotPayload(booted.frogbot);
    const found = (payload.collections.connections.config.endpoints || []).find(
      (candidate) => candidate.method === method && candidate.path === path,
    );

    if (!found) throw new Error(`No ${method} ${path} endpoint.`);

    return (req: object) =>
      found.handler({ ...req, payload } as unknown as Parameters<typeof found.handler>[0]);
  };

  const start = async (req: FrogBotRequest) => {
    const response = await endpoint(
      'get',
      '/:piece/authorize',
    )({
      ...req,
      url: `${ORIGIN}/api/connections/openai/authorize?returnTo=${encodeURIComponent('/admin/settings/connections')}`,
      routeParams: { piece: 'openai' },
    });

    expect(response.status).toBe(302);

    return new URL(response.headers.get('location')!);
  };

  const redirectOf = (url: URL) => url.searchParams.get('redirect_uri')!;
  const portOf = (url: URL) => Number(new URL(redirectOf(url)).port);

  const callback = (redirect: string, params: Record<string, string>) =>
    fetch(`${redirect}?${new URLSearchParams(params)}`, { redirect: 'manual' });

  const finish = (
    url: URL,
    code: string,
    { clientId, redirect = redirectOf(url), grant = {} } = {} as {
      clientId?: string;
      redirect?: string;
      grant?: Parameters<FakeOpenAI['grants']['set']>[1];
    },
  ) => {
    fake.grants.set(code, { nonce: url.searchParams.get('nonce')!, ...grant });

    return callback(redirect, {
      code,
      state: url.searchParams.get('state')!,
      ...(clientId ? { client_id: clientId } : {}),
    });
  };

  const signIn = async (req: FrogBotRequest, code: string, clientId: string) => {
    const response = await finish(await start(req), code, { clientId });

    expect(response.status).toBeLessThan(400);
  };

  const rows = (req: FrogBotRequest) => booted.frogbot.connections.list({ req });
  const exchanges = () =>
    fake
      .calls('/auth/api/accounts/oauth/token')
      .map(({ body }) => Object.fromEntries(new URLSearchParams(body)));

  const clientKey = (req: FrogBotRequest) =>
    `openai:chatgpt:client:${req.user!.collection}:${req.user!.id}`;

  const modelCalls = () => fake.calls('/api/v1/responses');
  const callsFor = (marker: string) => modelCalls().filter(({ body }) => body.includes(marker));
  const bearer = (marker: string) => callsFor(marker).map(({ headers }) => headers.authorization);
  const sentBody = (marker: string) => JSON.parse(callsFor(marker)[0].body) as Body;

  const disconnect = async (req: FrogBotRequest) => {
    const [row] = await rows(req);
    const response = await endpoint(
      'delete',
      '/:id',
    )({ ...req, routeParams: { id: String(row.id) } });

    expect(response.status).toBe(204);
  };

  const expire = (req: FrogBotRequest) =>
    booted.frogbot.update({
      collection: 'connections',
      where: { owner: { equals: req.user!.id } },
      data: { expiresAt: new Date(Date.now() - 1000).toISOString() },
      overrideAccess: true,
    });

  const jwt = async (email: string) =>
    (
      await booted.frogbot.login({
        collection: 'members',
        data: { email, password: 'password' },
        overrideAccess: true,
      })
    ).token!;

  const http = async (email: string, path: string, body: Body) =>
    createGatewayHandler(booted.frogbot)(
      new Request(`http://localhost/api/v1/${path}`, {
        method: 'POST',
        headers: {
          authorization: `JWT ${await jwt(email)}`,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      }),
    );

  const streamTurn = async (req: FrogBotRequest, prompt: string) => {
    const result = await booted.frogbot.agents[AGENT_SLUG].aiAgent.stream({
      prompt,
      options: { req, overrideAccess: true },
    });

    const errors: unknown[] = [];
    let text = '';

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') text += part.text;
      if (part.type === 'error') errors.push(part.error);
    }

    return { text, errors };
  };

  beforeAll(async () => {
    fake = await startFakeOpenAI();

    booted = await bootLinked({
      ai: { providers: { openai: { apiKey: 'sk-app' } } },
      connections: [{ piece: createOpenAI(), oauth: true, secret: true }],
      agents: [
        {
          slug: AGENT_SLUG,
          instructions: 'Help.',
          model: {
            default: 'openai/gpt-5.5',
            options: ['openai/gpt-5.5', 'openai/gpt-6-sol', 'openai/gpt-4o-mini'],
          },
          tools: [lookup],
        },
      ],
    });

    alice = await booted.member('alice@example.com');
    dave = await booted.member('dave@example.com');
    bob = await booted.member('bob@example.com');
    carol = await booted.member('carol@example.com');
  });

  afterAll(async () => {
    await booted?.frogbot.destroy();
    await fake?.close();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await booted.frogbot.delete({ collection: 'connections', where: {}, overrideAccess: true });

    for (const req of [alice, dave, bob, carol]) await booted.frogbot.kv.delete(clientKey(req));

    fake.reset();
  });

  describe('the 127.0.0.1 one-shot listener', () => {
    it('listens on 127.0.0.1 only, and other paths neither answer nor use up the sign-in', async () => {
      const url = await start(alice);
      const port = portOf(url);

      const others = Object.values(networkInterfaces())
        .flat()
        .filter((info) => info && !info.internal)
        .map((info) => info!.address);

      for (const host of ['::1', ...others]) {
        const outcome = await new Promise<string>((resolve) => {
          const socket = connect({ host, port, timeout: 1000 });

          socket.once('connect', () => {
            socket.destroy();
            resolve('connected');
          });

          socket.once('timeout', () => {
            socket.destroy();
            resolve('timeout');
          });

          socket.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? 'error'));
        });

        expect(outcome, host).not.toBe('connected');
      }

      const stray = await fetch(`http://127.0.0.1:${port}/favicon.ico`);

      expect(stray.status).toBe(404);

      const response = await finish(url, 'only-loopback', { clientId: 'oaiapp_alice' });

      expect(response.status).toBe(200);
      expect(await rows(alice)).toHaveLength(1);
    });

    it('takes one callback, then closes, so a replayed callback reaches nothing', async () => {
      const url = await start(alice);
      const params = { code: 'once', state: url.searchParams.get('state')!, client_id: 'oaiapp_a' };

      fake.grants.set('once', { nonce: url.searchParams.get('nonce')! });

      expect((await callback(redirectOf(url), params)).status).toBe(200);
      await expect(callback(redirectOf(url), params)).rejects.toThrow();
      expect(exchanges()).toHaveLength(1);
      expect(await rows(alice)).toHaveLength(1);
    });

    it('runs two users at once on separate listeners, and a callback on the wrong one saves nothing', async () => {
      const [aliceURL, daveURL] = await Promise.all([start(alice), start(dave)]);

      expect(portOf(aliceURL)).not.toBe(portOf(daveURL));
      expect(aliceURL.searchParams.get('ext_agent_host_id')).toBe(
        daveURL.searchParams.get('ext_agent_host_id'),
      );

      const crossed = await finish(aliceURL, 'crossed', {
        clientId: 'oaiapp_alice',
        redirect: redirectOf(daveURL),
      });

      expect(crossed.status).toBe(400);
      expect(await crossed.text()).toContain('This sign-in is out of date.');
      expect(exchanges()).toEqual([]);

      await expect(finish(daveURL, 'dave-late', { clientId: 'oaiapp_dave' })).rejects.toThrow();

      const own = await finish(aliceURL, 'alice-own', { clientId: 'oaiapp_alice' });

      expect(own.status).toBe(200);
      expect(exchanges()).toMatchObject([
        { client_id: 'oaiapp_alice', redirect_uri: redirectOf(aliceURL), code: 'alice-own' },
      ]);
      expect((await rows(alice)).map(({ account }) => account?.id)).toEqual(['chatgpt-user']);
      expect(await rows(dave)).toEqual([]);
    });

    it('escapes what OpenAI sends back in the failure page', async () => {
      const url = await start(alice);
      const response = await callback(redirectOf(url), {
        error: 'access_denied',
        error_description: '<script>alert(1)</script>',
        state: url.searchParams.get('state')!,
      });

      const page = await response.text();

      expect(response.status).toBe(400);
      expect(page).not.toContain('<script>');
      expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it("closes a user's earlier listener when they start again, and refuses its state on the new one", async () => {
      const first = await start(alice);
      const second = await start(alice);

      await expect(finish(first, 'first', { clientId: 'oaiapp_alice' })).rejects.toThrow();

      const late = await finish(first, 'late', {
        clientId: 'oaiapp_alice',
        redirect: redirectOf(second),
      });

      expect(late.status).toBe(400);
      expect(exchanges()).toEqual([]);
      expect(await rows(alice)).toEqual([]);
    });
  });

  describe('ID-token and plan-scope checks', () => {
    const now = () => Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

    it.each<
      [string, (nonce: string, clientId: string) => Parameters<FakeOpenAI['grants']['set']>[1]]
    >([
      ['an expired ID token', () => ({ claims: { exp: now() - 60, iat: now() - 700 } })],
      ['a trailing-slash issuer', () => ({ claims: { iss: 'https://auth.openai.com/' } })],
      ['no nonce claim', () => ({ claims: { nonce: undefined } })],
      ['an empty subject', () => ({ claims: { sub: ' ' } })],
      ['no ID token', () => ({ idToken: null })],
      [
        'an unsigned (alg none) ID token',
        (nonce, clientId) => ({
          idToken: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
            iss: 'https://auth.openai.com',
            aud: clientId,
            sub: 'mallory',
            nonce,
            exp: now() + 600,
          })}.`,
        }),
      ],
      [
        'an HS256 ID token keyed with the public key',
        (nonce, clientId) => {
          const input = `${encode({ alg: 'HS256', typ: 'JWT', kid: 'fake-openai' })}.${encode({
            iss: 'https://auth.openai.com',
            aud: clientId,
            sub: 'mallory',
            nonce,
            exp: now() + 600,
          })}`;

          const secret = JSON.stringify(fake.key.jwk);

          return {
            idToken: `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`,
          };
        },
      ],
      ['a token for another app', () => ({ claims: { aud: ['oaiapp_other'] } })],
    ])('refuses %s and saves nothing', async (_kind, grant) => {
      const url = await start(alice);
      const response = await finish(url, 'bad', {
        clientId: 'oaiapp_alice',
        grant: grant(url.searchParams.get('nonce')!, 'oaiapp_alice'),
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toContain(INVALID);
      expect(await rows(alice)).toEqual([]);
      expect(await booted.frogbot.kv.get(clientKey(alice))).toBeNull();
    });

    it('accepts an ID token whose audience list includes the issued client ID', async () => {
      const url = await start(alice);
      const response = await finish(url, 'aud-list', {
        clientId: 'oaiapp_alice',
        grant: { claims: { aud: ['oaiapp_alice', 'https://api.openai.com/v1'] } },
      });

      expect(response.status).toBe(200);
    });

    it.each<[string, string | null]>([
      ['no scope at all', null],
      ['a lookalike scope', 'openid offline_access chatgpt.tokens.use.direct.preview'],
      ['the plan scope without a separator', 'openid,chatgpt.tokens.use.direct'],
    ])('refuses the link with the plan-use message when the grant has %s', async (_kind, scope) => {
      const url = await start(alice);
      const response = await finish(url, 'no-plan', { clientId: 'oaiapp_alice', grant: { scope } });
      const page = await response.text();

      expect(response.status).toBe(400);
      expect(page).toContain(NO_PLAN.replace("didn't", 'didn&#39;t'));
      expect(page).toContain('href="http://localhost:3000/admin/settings/connections"');
      expect(await rows(alice)).toEqual([]);
    });
  });

  describe('IDs in KV, disconnect and refresh', () => {
    it('makes one host ID per install even when the first sign-ins start together', async () => {
      await booted.frogbot.kv.delete(HOST_KEY);

      const urls = await Promise.all([start(alice), start(dave), start(bob), start(carol)]);
      const hosts = new Set(urls.map((url) => url.searchParams.get('ext_agent_host_id')));

      expect(hosts.size).toBe(1);
      expect([...hosts][0]).toBe(await booted.frogbot.kv.get(HOST_KEY));
      expect([...hosts][0]).toMatch(/^urn:uuid:/);
    });

    it("keeps each user's issued client ID across reconnects; disconnect revokes and keeps it", async () => {
      await signIn(alice, 'alice-1', 'oaiapp_alice');
      await signIn(dave, 'dave-1', 'oaiapp_dave');

      expect(await booted.frogbot.kv.get(clientKey(alice))).toBe('oaiapp_alice');
      expect(await booted.frogbot.kv.get(clientKey(dave))).toBe('oaiapp_dave');

      await disconnect(alice);

      expect(
        fake
          .calls('/auth/oauth/revoke')
          .map(({ body }) => Object.fromEntries(new URLSearchParams(body))),
      ).toEqual([
        {
          token: 'plan-refresh-alice-1',
          token_type_hint: 'refresh_token',
          client_id: 'oaiapp_alice',
        },
      ]);
      expect(await booted.frogbot.kv.get(clientKey(alice))).toBe('oaiapp_alice');
      expect(await rows(dave)).toHaveLength(1);

      const again = await start(alice);

      expect(again.searchParams.get('client_id')).toBe('oaiapp_alice');
      expect(again.searchParams.has('agent_name_hint')).toBe(false);

      const response = await finish(again, 'alice-2');

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${ORIGIN}/admin/settings/connections`);
      expect(exchanges().at(-1)).toMatchObject({ client_id: 'oaiapp_alice', code: 'alice-2' });
    });

    it('refreshes with the issued client ID, keeps it when OpenAI omits fields, and revokes the latest refresh token', async () => {
      await signIn(alice, 'refresh', 'oaiapp_alice');
      await expire(alice);
      fake.responses.push(say('After refresh'));

      expect((await booted.turn(alice, 'refresh-turn-1')).text).toBe('After refresh');
      expect(exchanges().at(-1)).toEqual({
        grant_type: 'refresh_token',
        client_id: 'oaiapp_alice',
        refresh_token: 'plan-refresh-refresh',
        resource: 'https://api.openai.com/v1',
      });
      expect(bearer('refresh-turn-1')).toEqual(['Bearer refreshed-access-1']);

      fake.refresh.omitRefreshToken = true;
      await expire(alice);
      await booted.turn(alice, 'refresh-turn-2');

      expect(exchanges().at(-1)).toMatchObject({
        client_id: 'oaiapp_alice',
        refresh_token: 'refreshed-refresh-1',
      });
      expect(bearer('refresh-turn-2')).toEqual(['Bearer refreshed-access-2']);

      await disconnect(alice);

      expect(
        Object.fromEntries(new URLSearchParams(fake.calls('/auth/oauth/revoke')[0].body)),
      ).toMatchObject({ token: 'refreshed-refresh-1', client_id: 'oaiapp_alice' });
    });

    it('fails a refused refresh without falling back to the app key', async () => {
      await signIn(alice, 'refused', 'oaiapp_alice');
      await expire(alice);
      fake.refresh.fail = 400;

      await expect(booted.turn(alice, 'refused-turn')).rejects.toThrow(/Reconnect/);
      expect(modelCalls()).toEqual([]);
    });
  });

  describe('key isolation', () => {
    it('keeps two plan users, a pasted key and the app key apart on concurrent calls', async () => {
      await signIn(alice, 'alice', 'oaiapp_alice');
      await signIn(dave, 'dave', 'oaiapp_dave');

      expect((await booted.link(bob, { apiKey: 'sk-bob' })).status).toBe(200);

      const users = { alice, dave, bob, carol };
      const work: PromiseLike<unknown>[] = [];

      for (let i = 0; i < 4; i++) {
        for (const [name, req] of Object.entries(users)) {
          work.push(
            booted.turn(req, `${name}-turn-${i}`),
            streamTurn(req, `${name}-stream-${i}`),
            booted.frogbot.generateText({
              model: 'openai/gpt-5.5',
              req,
              prompt: `${name}-text-${i}`,
              maxOutputTokens: 500,
            }),
          );
        }
      }

      const settled = await Promise.allSettled(work);

      expect(settled.filter(({ status }) => status === 'rejected')).toEqual([]);

      const expected = {
        alice: 'Bearer plan-access-alice',
        dave: 'Bearer plan-access-dave',
        bob: 'Bearer sk-bob',
        carol: 'Bearer sk-app',
      };

      for (const [name, key] of Object.entries(expected)) {
        for (let i = 0; i < 4; i++) {
          for (const kind of ['turn', 'stream', 'text']) {
            const marker = `${name}-${kind}-${i}`;

            expect(bearer(marker), marker).toEqual([key]);

            const body = sentBody(marker);
            const plan = name === 'alice' || name === 'dave';

            expect(body.stream === true, `${marker} streams`).toBe(plan || kind === 'stream');
            expect(body.store, `${marker} store`).toBe(plan ? false : undefined);
          }

          expect(sentBody(`${name}-text-${i}`).max_output_tokens, name).toBe(
            name === 'alice' || name === 'dave' ? undefined : 500,
          );
        }
      }
    });

    it("uses a plan user's new token after a refresh, not a cached one", async () => {
      await signIn(alice, 'cached', 'oaiapp_alice');
      await booted.turn(alice, 'cache-before');
      await expire(alice);
      await booted.turn(alice, 'cache-after');

      expect(bearer('cache-before')).toEqual(['Bearer plan-access-cached']);
      expect(bearer('cache-after')).toEqual(['Bearer refreshed-access-1']);
    });
  });

  describe('plan calls', () => {
    beforeEach(async () => {
      await signIn(alice, 'calls', 'oaiapp_alice');
    });

    it('streams a title-style call and drops the fields the plan route rejects', async () => {
      fake.responses.push(say('Trip planning'));

      const result = await booted.frogbot.generateText({
        model: 'openai/gpt-5.5',
        req: alice,
        overrideAccess: true,
        instructions: 'Title this.',
        messages: [{ role: 'user', content: 'title-call' }],
        maxOutputTokens: 1000,
        temperature: 0.2,
        providerOptions: { openai: { reasoningEffort: 'low', user: 'u1', metadata: { a: 'b' } } },
      });

      const body = sentBody('title-call');

      expect(result.text).toBe('Trip planning');
      expect(body).toMatchObject({ stream: true, store: false, reasoning: { effort: 'low' } });
      expect((body.input as { role: string }[])[0]).toMatchObject({ role: 'developer' });

      for (const field of ['max_output_tokens', 'temperature', 'user', 'metadata']) {
        expect(body, field).not.toHaveProperty(field);
      }
    });

    it('builds a structured AI-field answer from the stream', async () => {
      fake.responses.push(say('{"result":"green"}'));

      const result = await booted.frogbot.generateText({
        model: 'openai/gpt-5.5',
        req: alice,
        messages: [{ role: 'user', content: 'field-call' }],
        output: Output.choice({ options: ['red', 'green'] }),
      });

      expect(result.output).toBe('green');
      expect(sentBody('field-call')).toMatchObject({
        stream: true,
        text: { format: { type: 'json_schema' } },
      });
    });

    it('runs an agent.generate turn with a tool call, each step a streamed call', async () => {
      fake.responses.push(
        sse([
          ...inProgress,
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'lookup',
              arguments: '',
            },
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'lookup',
              arguments: '{}',
              status: 'completed',
            },
          },
          completedEvent,
        ]),
        say('Found it for you'),
      );

      const result = await booted.turn(alice, 'tool-turn');
      const [first, second] = callsFor('tool-turn').map(({ body }) => JSON.parse(body) as Body);

      expect(result.text).toBe('Found it for you');
      expect(first).toMatchObject({ stream: true, tools: [{ type: 'function', name: 'lookup' }] });
      expect(second.stream).toBe(true);
      expect(JSON.stringify(second.input)).toContain('Found it.');
    });

    it('sends a body over 1 MiB zstd-compressed on a plan, and plain on a pasted key', async () => {
      const big = `zstd-${'a'.repeat(1.5 * 1024 * 1024)}`;

      await booted.frogbot.generateText({ model: 'openai/gpt-5.5', req: alice, prompt: big });

      const [plan] = callsFor('zstd-');

      expect(plan.headers['content-encoding']).toBe('zstd');
      expect(plan.bytes).toBeLessThan(64 * 1024);
      expect(JSON.parse(plan.body)).toMatchObject({ stream: true });

      await booted.link(bob, { apiKey: 'sk-bob' });
      fake.received.length = 0;
      await booted.frogbot.generateText({ model: 'openai/gpt-5.5', req: bob, prompt: big });

      const [key] = callsFor('zstd-');

      expect(key.headers['content-encoding']).toBeUndefined();
      expect(key.bytes).toBeGreaterThan(1024 * 1024);
    });

    it('keeps web search and drops other hosted tools on the wire', async () => {
      const openai = createOpenAIProvider({ apiKey: 'plan', baseURL: 'https://api.openai.com/v1' });

      await generateText({
        model: wrapLanguageModel({
          model: openai.responses('gpt-5.5'),
          middleware: createChatGPTMiddleware(),
        }),
        prompt: 'search-call',
        tools: {
          web_search: openai.tools.webSearch({}),
          code_interpreter: openai.tools.codeInterpreter({}),
          lookup: { description: 'Look up.', inputSchema: z.object({}) },
        },
      });

      expect((sentBody('search-call').tools as { type: string }[]).map(({ type }) => type)).toEqual(
        ['web_search', 'function'],
      );
    });
  });

  describe("the app's API", () => {
    it.each<[string, Body]>([
      [
        'chat/completions',
        { model: 'openai/gpt-5.5', messages: [{ role: 'user', content: 'hi' }] },
      ],
      [
        'chat/completions',
        { model: 'openai/gpt-5.5', stream: true, messages: [{ role: 'user', content: 'hi' }] },
      ],
      ['responses', { model: 'openai/gpt-5.5', input: 'hi' }],
      [
        'messages',
        { model: 'openai/gpt-5.5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] },
      ],
      ['embeddings', { model: 'openai/text-embedding-3-small', input: 'hi' }],
    ])('refuses a plan user on /api/v1/%s with 403 and no upstream call', async (path, body) => {
      await signIn(alice, 'api', 'oaiapp_alice');
      fake.received.length = 0;

      const response = await http('alice@example.com', path, body);
      const text = await response.text();

      expect(response.status).toBe(403);
      expect(text).toContain(NO_API_ACCESS);
      expect(fake.received.filter(({ path: sent }) => sent.startsWith('/api/'))).toEqual([]);
    });

    it('still serves a pasted key and the app key there', async () => {
      await booted.link(bob, { apiKey: 'sk-bob' });

      for (const [email, key] of [
        ['bob@example.com', 'Bearer sk-bob'],
        ['carol@example.com', 'Bearer sk-app'],
      ]) {
        const response = await http(email, 'chat/completions', {
          model: 'openai/gpt-5.5',
          messages: [{ role: 'user', content: `api-${email}` }],
        });

        expect(response.status, email).toBe(200);
        expect(bearer(`api-${email}`)).toEqual([key]);
      }
    });
  });

  describe('plan errors', () => {
    beforeEach(async () => {
      await signIn(alice, 'errors', 'oaiapp_alice');
    });

    it.each(REFUSALS)(
      '%s as an HTTP error fails the turn at once',
      async (code, status, message) => {
        fake.responses.push(
          json(status, { error: { code, message: code, type: 'invalid_request_error' } }),
        );

        await expect(booted.turn(alice, `http-${code}`)).rejects.toThrow(message);
        expect(callsFor(`http-${code}`)).toHaveLength(1);
      },
    );

    it.each(REFUSALS)(
      '%s failing the response before output, after a pause, fails at once',
      async (code, _status, message) => {
        fake.responses.push(sse([...inProgress, failedEvent(code)], 120));

        await expect(booted.turn(alice, `late-${code}`)).rejects.toThrow(message);
        expect(callsFor(`late-${code}`)).toHaveLength(1);
      },
    );

    it.each(BUSY_CODES)(
      '%s retries twice, 1 s then 2 s apart, then says busy',
      async (code) => {
        for (let i = 0; i < 3; i++) {
          fake.responses.push(json(503, { error: { code, message: code, type: 'server_error' } }));
        }

        await expect(booted.turn(alice, `busy-${code}`)).rejects.toThrow(BUSY);

        const at = callsFor(`busy-${code}`).map((call) => call.at);

        expect(at).toHaveLength(3);
        expect(at[1] - at[0]).toBeGreaterThanOrEqual(950);
        expect(at[2] - at[1]).toBeGreaterThanOrEqual(1950);
      },
      15_000,
    );

    it.each(BUSY_CODES)(
      '%s failing the response before output, after a pause, is retried',
      async (code) => {
        fake.responses.push(sse([...inProgress, failedEvent(code)], 120), say('Recovered'));

        expect((await booted.turn(alice, `busy-late-${code}`)).text).toBe('Recovered');
        expect(callsFor(`busy-late-${code}`)).toHaveLength(2);
      },
      15_000,
    );

    it('says busy, without a retry, when the plan is busy after output', async () => {
      fake.responses.push(sse([...textEvents('Partial'), errorEvent(BUSY_CODES[0])]));

      const { errors } = await streamTurn(alice, 'busy-mid');

      expect((errors[0] as Error).message).toBe(BUSY);
      expect(callsFor('busy-mid')).toHaveLength(1);
    });

    it('ends a stream with the plan-limit message, linking to ChatGPT usage, after output', async () => {
      fake.responses.push(
        sse(
          [...textEvents('Partial'), errorEvent('subscription_sharing_usage_limit_exceeded')],
          20,
        ),
      );

      const { text, errors } = await streamTurn(alice, 'limit-mid');

      expect(text).toContain('Partial');
      expect((errors[0] as Error).message).toBe(REFUSALS[0][2]);
      expect((errors[0] as Error).message).toContain(USAGE_URL);
      expect(callsFor('limit-mid')).toHaveLength(1);
    });

    it('fails a non-streamed turn whose stream breaks after output with the mapped message', async () => {
      fake.responses.push(sse([...textEvents('Partial'), failedEvent(REFUSALS[1][0])]));

      await expect(booted.turn(alice, 'mid-generate')).rejects.toThrow(REFUSALS[1][2]);
      expect(callsFor('mid-generate')).toHaveLength(1);
    });

    it('maps a bare 401 to Reconnect ChatGPT, with no app-key fallback', async () => {
      fake.responses.push(json(401, { detail: 'Unauthorized' }));

      await expect(booted.turn(alice, 'bare-401')).rejects.toThrow(RECONNECT);
      expect(modelCalls().map(({ headers }) => headers.authorization)).toEqual([
        'Bearer plan-access-errors',
      ]);
    });
  });

  describe('restricted API keys (F-453)', () => {
    it.each([401, 403])(
      'links a restricted key whose model list answers %s for a missing permission',
      async (status) => {
        fake.keyModels = (key) =>
          key === 'sk-restricted'
            ? json(status, {
                error: {
                  message:
                    'You have insufficient permissions for this operation. Missing scopes: api.model.read.',
                  type: 'invalid_request_error',
                },
              })
            : undefined;

        expect((await booted.link(bob, { apiKey: 'sk-restricted' })).status).toBe(200);
        expect((await booted.picker(bob))?.models).toEqual([
          'openai/gpt-5.5',
          'openai/gpt-6-sol',
          'openai/gpt-4o-mini',
        ]);

        await booted.turn(bob, 'restricted-turn');

        expect(bearer('restricted-turn')).toEqual(['Bearer sk-restricted']);
      },
    );

    it.each<[string, number, Body]>([
      [
        'an invalid key',
        401,
        { error: { message: 'Incorrect API key provided: sk-bad.', code: 'invalid_api_key' } },
      ],
      [
        'a revoked key',
        401,
        { error: { message: 'This key was revoked.', code: 'invalid_api_key' } },
      ],
      [
        'a forbidden project',
        403,
        {
          error: { message: 'Project not allowed.', code: 'unsupported_country_region_territory' },
        },
      ],
    ])('still refuses %s', async (_kind, status, body) => {
      fake.keyModels = () => json(status, body);

      const response = await booted.link(bob, { apiKey: 'sk-bad' });

      expect(response.status).toBe(422);
      expect(await rows(bob)).toEqual([]);
    });
  });
});
