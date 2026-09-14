import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { buildTriggerEndpoints } from '../../../../packages/frogbot/src/triggers/endpoints.js';
import { createEchoPiece, echoCalls, echoSecret, resetEchoCalls } from './fixtures/piece-echo.js';

const instance = createEchoPiece({ prefix: 'echo: ' });
const appSubscriber = {
  agentSlug: 'ops',
  piece: instance,
  trigger: { trigger: instance.triggers.received, handler: vi.fn() },
  input: {},
};
const webhookSubscriber = {
  agentSlug: 'ops',
  piece: instance,
  trigger: { trigger: instance.triggers.subscribed, handler: vi.fn() },
  input: { channel: 'alerts' },
};
const otherSubscriber = {
  agentSlug: 'audit',
  piece: instance,
  trigger: { trigger: instance.triggers.other, handler: vi.fn() },
  input: { channel: 'audit' },
};
const subscriptionRow = {
  id: 42,
  agent: 'ops',
  instance: 'echo',
  trigger: 'subscribed',
  status: 'active',
  input: { value: { channel: 'runtime' } },
  state: { enabled: 'runtime' },
};

function request(body: Record<string, unknown>, subscription?: string) {
  const raw = JSON.stringify(body);
  return Object.assign(
    new Request('http://localhost/api/webhooks/echo', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-echo-signature': createHmac('sha256', echoSecret).update(raw).digest('hex'),
      },
      body: raw,
    }),
    {
      context: {},
      routeParams: { instance: 'echo', ...(subscription ? { subscription } : {}) },
    },
  );
}

function kv() {
  const values = new Set<string>();
  return {
    has: vi.fn(async (key: string) => values.has(key)),
    setIfAbsent: vi.fn(async (key: string) => {
      if (values.has(key)) return false;
      values.add(key);
      return true;
    }),
    lock: vi.fn(async (_key, _ttl, fn) => fn({ signal: new AbortController().signal })),
  };
}

const post = buildTriggerEndpoints().find(
  ({ path, method }) => path === '/webhooks/:instance' && method === 'post',
)!;
const subscribedPost = buildTriggerEndpoints().find(({ path }) => path.endsWith('/:subscription'))!;

describe('trigger endpoints', () => {
  beforeEach(resetEchoCalls);

  it('parses a signed real Request and dispatches matching app triggers', async () => {
    const frogbot = {
      config: {
        _internal: {
          triggers: { echo: { instance, subscribers: [appSubscriber, webhookSubscriber] } },
        },
      },
      kv: kv(),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ id: 'one', event: 'received', message: 'hello' }), {
      frogbot,
    });
    await expect(post.handler(req as never)).resolves.toMatchObject({ status: 200 });
    expect(echoCalls).toEqual([
      expect.objectContaining({
        type: 'app',
        options: { prefix: 'echo: ' },
        client: { prefix: 'echo: ' },
      }),
    ]);
    expect(frogbot.queue).toHaveBeenCalledTimes(1);
    expect(frogbot.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          triggerSlug: 'received',
          event: { dedupeKey: 'one', data: { message: 'echo: hello' } },
        }),
      }),
    );
    expect(req.bodyUsed).toBe(false);
  });

  it('looks up a subscription by ID and instance and uses its persisted input', async () => {
    const frogbot = {
      config: {
        _internal: {
          triggers: { echo: { instance, subscribers: [webhookSubscriber, otherSubscriber] } },
        },
      },
      find: vi.fn().mockResolvedValue({
        docs: [subscriptionRow],
      }),
      kv: kv(),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ id: 'two', message: 'hello' }, '42'), { frogbot });
    await subscribedPost.handler(req as never);
    expect(echoCalls).toEqual([
      expect.objectContaining({
        type: 'webhook',
        input: { channel: 'runtime' },
        state: { enabled: 'runtime' },
      }),
    ]);
    expect(frogbot.queue).toHaveBeenCalledTimes(1);
    expect(frogbot.queue).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ triggerSlug: 'subscribed' }) }),
    );
    expect(frogbot.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ id: { equals: '42' } }, { instance: { equals: 'echo' } }] },
        limit: 1,
        overrideAccess: true,
      }),
    );
    expect(webhookSubscriber.input).toEqual({ channel: 'alerts' });
  });

  it('dispatches subscribed triggers without a piece webhook and passes persisted state', async () => {
    const run = vi.fn(async ({ req, state }) => {
      const data = req.data as { id: string; token: string };

      return data.token === state.token ? [{ dedupeKey: data.id, data }] : [];
    });
    const instance = definePiece({
      slug: 'stateful',
      label: 'Stateful',
      actions: [],
      triggers: [
        {
          slug: 'received',
          type: 'webhook',
          description: 'Receive authenticated events',
          input: z.object({}),
          output: z.object({ id: z.string(), token: z.string() }),
          async onEnable() {
            return { token: 'persisted-secret' };
          },
          async onDisable() {},
          run,
        },
      ],
    })();
    const subscriber = {
      agentSlug: 'ops',
      piece: instance,
      trigger: { trigger: instance.triggers.received, handler: vi.fn() },
      input: {},
    };
    const state = { token: 'persisted-secret' };
    const frogbot = {
      config: { _internal: { triggers: { stateful: { instance, subscribers: [subscriber] } } } },
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            ...subscriptionRow,
            instance: 'stateful',
            trigger: 'received',
            input: { value: {} },
            state,
          },
        ],
      }),
      kv: kv(),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ id: 'stateful', token: 'persisted-secret' }, '42'), {
      frogbot,
      routeParams: { instance: 'stateful', subscription: '42' },
    });

    await expect(subscribedPost.handler(req as never)).resolves.toMatchObject({ status: 200 });

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ state }));
    expect(frogbot.queue).toHaveBeenCalledTimes(1);
  });

  it.each([
    { method: 'POST', endpoint: post },
    { method: 'GET', endpoint: buildTriggerEndpoints().find(({ method }) => method === 'get')! },
  ])(
    'returns 404 for $method app ingress without a piece webhook',
    async ({ method, endpoint }) => {
      const instance = definePiece({
        slug: 'unsafe',
        label: 'Unsafe',
        actions: [],
      })();
      const frogbot = {
        config: { _internal: { triggers: { unsafe: { instance, subscribers: [] } } } },
        queue: vi.fn(),
      };
      const req = Object.assign(new Request('http://localhost/api/webhooks/unsafe', { method }), {
        frogbot,
        context: {},
        routeParams: { instance: 'unsafe' },
      });

      await expect(endpoint.handler(req as never)).resolves.toMatchObject({ status: 404 });

      expect(frogbot.queue).not.toHaveBeenCalled();
    },
  );

  it.each([
    { docs: [] },
    { docs: [{ ...subscriptionRow, status: 'error' }] },
    { docs: [{ ...subscriptionRow, cleanupPending: true }] },
    { docs: [{ ...subscriptionRow, enablePending: true }] },
    { docs: [{ ...subscriptionRow, agent: 'removed' }] },
  ])('rejects event dispatch for an unavailable subscription (%j)', async ({ docs }) => {
    const frogbot = {
      config: {
        _internal: { triggers: { echo: { instance, subscribers: [webhookSubscriber] } } },
      },
      find: vi.fn().mockResolvedValue({ docs }),
      kv: kv(),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ id: 'missing', message: 'hello' }, '42'), { frogbot });
    await expect(subscribedPost.handler(req as never)).resolves.toMatchObject({ status: 404 });
    expect(frogbot.queue).not.toHaveBeenCalled();
    expect(echoCalls).toEqual([]);
  });

  it('answers a verified registration challenge before the subscription becomes active', async () => {
    const frogbot = {
      config: {
        _internal: { triggers: { echo: { instance, subscribers: [webhookSubscriber] } } },
      },
      find: vi.fn().mockResolvedValue({
        docs: [{ ...subscriptionRow, status: 'error', enablePending: true }],
      }),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ challenge: 'register' }, '42'), { frogbot });
    const response = await subscribedPost.handler(req as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: 'register' });
    expect(frogbot.queue).not.toHaveBeenCalled();
    expect(echoCalls).toEqual([]);
  });

  it('rejects an unsigned registration challenge before looking up the subscription', async () => {
    const frogbot = {
      config: {
        _internal: { triggers: { echo: { instance, subscribers: [webhookSubscriber] } } },
      },
      find: vi.fn().mockResolvedValue({
        docs: [{ ...subscriptionRow, status: 'error', enablePending: true }],
      }),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ challenge: 'register' }, '42'), { frogbot });
    req.headers.set('x-echo-signature', 'invalid');
    await expect(subscribedPost.handler(req as never)).resolves.toMatchObject({ status: 401 });
    expect(frogbot.find).not.toHaveBeenCalled();
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('returns 404 for a verified challenge addressed to an unknown subscription', async () => {
    const frogbot = {
      config: {
        _internal: { triggers: { echo: { instance, subscribers: [webhookSubscriber] } } },
      },
      find: vi.fn().mockResolvedValue({ docs: [] }),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ challenge: 'register' }, '42'), { frogbot });
    await expect(subscribedPost.handler(req as never)).resolves.toMatchObject({ status: 404 });
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it.each(['app', 'webhook'] as const)(
    'uses developer credentials and a userless callback request for a signed %s delivery',
    async (type) => {
      const raw = '{\n  "id": "signed", "event": "received", "message": "héllo"\n}';
      const data = JSON.parse(raw);
      const user = { id: 7, collection: 'users' };
      const verificationBodies: string[] = [];
      const callbackBodies: string[] = [];
      const verify = vi.fn(async ({ req }) => {
        const body = await req.text();
        verificationBodies.push(body);
        return (
          req.headers.get('x-echo-signature') ===
          createHmac('sha256', echoSecret).update(body).digest('hex')
        );
      });
      const run = vi.fn(async ({ req, client }) => {
        callbackBodies.push(await req.text());
        return [{ dedupeKey: req.data.id, data: { token: client.token } }];
      });
      const trigger = {
        slug: 'received',
        description: 'Receive',
        input: z.object({}),
        output: z.object({ token: z.string() }),
        run,
      };
      const instance = definePiece({
        slug: 'owned',
        label: 'Owned',
        actions: [],
        auth: z.object({ token: z.string() }),
        client: ({ auth }) => auth,
        webhook: { verify, parse: ({ req }) => ({ event: req.data!.event }) },
        triggers: [
          type === 'app'
            ? { ...trigger, type: 'app', event: 'received' }
            : {
                ...trigger,
                type: 'webhook',
                onEnable: async () => ({}),
                onDisable: async () => {},
              },
        ],
      })({ auth: { token: 'developer' } });
      const client = vi.spyOn(instance, 'client');
      const resolvePieceCredential = vi.fn(async ({ req, piece }) => ({
        auth: req.user ? { token: 'user' } : { token: 'developer' },
        key: piece,
      }));
      const subscriber = {
        agentSlug: 'ops',
        piece: instance,
        trigger: { trigger: instance.triggers.received, handler: vi.fn() },
        input: {},
      };
      const frogbot = {
        config: { _internal: { triggers: { owned: { instance, subscribers: [subscriber] } } } },
        connections: { resolvePieceCredential },
        find: vi.fn().mockResolvedValue({
          docs: [
            { ...subscriptionRow, instance: 'owned', trigger: 'received', input: { value: {} } },
          ],
        }),
        kv: kv(),
        queue: vi.fn(),
      };
      const req = Object.assign(
        new Request('http://localhost/api/webhooks/owned', {
          method: 'POST',
          body: raw,
          headers: {
            'content-type': 'application/json',
            'x-echo-signature': createHmac('sha256', echoSecret).update(raw).digest('hex'),
          },
        }),
        {
          frogbot,
          user,
          context: { trace: 'delivery' },
          routeParams: { instance: 'owned', ...(type === 'webhook' ? { subscription: '42' } : {}) },
        },
      );
      const endpoint = type === 'app' ? post : subscribedPost;
      await expect(endpoint.handler(req as never)).resolves.toMatchObject({ status: 200 });
      expect(verificationBodies).toEqual([raw]);
      expect(verify.mock.calls[0]![0].req.user).toBe(user);
      expect(resolvePieceCredential).toHaveBeenCalledTimes(1);
      expect(resolvePieceCredential.mock.calls[0]![0].req.user).toBeNull();
      expect(client).toHaveBeenCalledWith({
        req: expect.objectContaining({ user: null, data, context: req.context, frogbot }),
      });
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          client: { token: 'developer' },
          req: expect.objectContaining({ user: null, data, context: req.context, frogbot }),
        }),
      );
      expect(callbackBodies).toEqual([raw]);
      expect(frogbot.queue).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            event: { dedupeKey: 'signed', data: { token: 'developer' } },
          }),
        }),
      );
      expect(req.user).toBe(user);
      expect(await req.text()).toBe(raw);
    },
  );

  it('applies the trigger input schema to persisted raw input, including Date transforms', async () => {
    const since = '2026-09-12T00:00:00.000Z';
    const run = vi.fn(async ({ input }) => [
      { dedupeKey: 'date', data: { since: input.since.toISOString() } },
    ]);
    const instance = definePiece({
      slug: 'dates',
      label: 'Dates',
      actions: [],
      webhook: { verify: async () => true },
      triggers: [
        {
          slug: 'dated',
          type: 'webhook',
          description: 'Receive dated events',
          input: z.object({ since: z.string().transform((value) => new Date(value)) }),
          output: z.object({ since: z.string() }),
          onEnable: async ({ input }) => ({ since: input.since.toISOString() }),
          onDisable: async () => {},
          run,
        },
      ],
    })();
    const subscriber = {
      agentSlug: 'ops',
      piece: instance,
      trigger: { trigger: instance.triggers.dated, handler: vi.fn() },
      input: { since: new Date('2020-01-01T00:00:00.000Z') },
    };
    const frogbot = {
      config: { _internal: { triggers: { dates: { instance, subscribers: [subscriber] } } } },
      find: vi.fn().mockResolvedValue({
        docs: [
          { ...subscriptionRow, instance: 'dates', trigger: 'dated', input: { value: { since } } },
        ],
      }),
      kv: kv(),
      queue: vi.fn(),
    };
    const req = Object.assign(request({ id: 'date' }, '42'), {
      frogbot,
      routeParams: { instance: 'dates', subscription: '42' },
    });
    await expect(subscribedPost.handler(req as never)).resolves.toMatchObject({ status: 200 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0].input).toEqual({ since: new Date(since) });
    expect(run.mock.calls[0]![0].input.since).toBeInstanceOf(Date);
    expect(frogbot.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ event: { dedupeKey: 'date', data: { since } } }),
      }),
    );
  });

  it('verifies POST challenges using raw bytes and parses their JSON', async () => {
    const frogbot = {
      config: { _internal: { triggers: { echo: { instance, subscribers: [appSubscriber] } } } },
      queue: vi.fn(),
    };
    const req = Object.assign(request({ challenge: 'challenge' }), { frogbot });
    const response = await post.handler(req as never);
    expect(await response.json()).toEqual({ challenge: 'challenge' });
    expect(frogbot.queue).not.toHaveBeenCalled();
    expect(await req.text()).toBe(JSON.stringify({ challenge: 'challenge' }));
  });

  it('rejects invalid signatures before running a POST handshake', async () => {
    const frogbot = {
      config: { _internal: { triggers: { echo: { instance, subscribers: [appSubscriber] } } } },
      queue: vi.fn(),
    };
    const req = Object.assign(request({ challenge: 'challenge' }), { frogbot });
    req.headers.set('x-echo-signature', 'invalid');
    await expect(post.handler(req as never)).resolves.toMatchObject({ status: 401 });
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('routes GET directly to the handshake with its query and request context', async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const handshake = vi.fn(async ({ req }) => Response.json({ challenge: req.query.challenge }));
    const instance = definePiece({
      slug: 'challenge',
      label: 'Challenge',
      actions: [],
      webhook: { verify, handshake },
    })();
    const frogbot = {
      config: { _internal: { triggers: { challenge: { instance, subscribers: [] } } } },
      queue: vi.fn(),
    };
    const req = Object.assign(
      new Request('http://localhost/api/webhooks/challenge?challenge=hello'),
      {
        frogbot,
        context: { trace: 'trace' },
        query: { challenge: 'hello' },
        routeParams: { instance: 'challenge' },
      },
    );
    const endpoint = buildTriggerEndpoints().find(({ method }) => method === 'get')!;
    const response = await endpoint.handler(req as never);
    expect(await response.json()).toEqual({ challenge: 'hello' });
    expect(verify).not.toHaveBeenCalled();
    expect(handshake).toHaveBeenCalledWith(
      expect.objectContaining({ req: expect.objectContaining({ frogbot, context: req.context }) }),
    );
    expect(frogbot.queue).not.toHaveBeenCalled();
    handshake.mockResolvedValueOnce(null as never);
    await expect(endpoint.handler(req as never)).resolves.toMatchObject({ status: 404 });
  });

  it('keeps each app subscriber’s filtered and transformed results isolated', async () => {
    const instance = definePiece({
      slug: 'filtered',
      label: 'Filtered',
      actions: [],
      webhook: { verify: async () => true, parse: ({ req }) => ({ event: req.data!.event }) },
      triggers: [
        {
          slug: 'received',
          type: 'app',
          event: 'received',
          description: 'Receive',
          input: z.object({ accept: z.boolean(), label: z.string() }),
          output: z.object({ label: z.string() }),
          async run({ input, req }) {
            expect(await req.json!()).toEqual(req.data);
            return input.accept ? [{ dedupeKey: req.data!.id, data: { label: input.label } }] : [];
          },
        },
      ],
    })();
    const subscribers = ['ops', 'audit', 'ignored'].map((agentSlug) => ({
      agentSlug,
      piece: instance,
      trigger: { trigger: instance.triggers.received, handler: vi.fn() },
      input: { accept: agentSlug !== 'ignored', label: agentSlug },
    }));
    const frogbot = {
      config: { _internal: { triggers: { filtered: { instance, subscribers } } } },
      kv: kv(),
      queue: vi.fn(),
    };
    for (let i = 0; i < 2; i++) {
      const req = Object.assign(request({ id: 'same', event: 'received' }), {
        frogbot,
        routeParams: { instance: 'filtered' },
      });
      await post.handler(req as never);
    }
    expect(
      frogbot.queue.mock.calls.map(([job]) => [job.input.agentSlug, job.input.event.data]),
    ).toEqual([
      ['ops', { label: 'ops' }],
      ['audit', { label: 'audit' }],
    ]);
  });

  it('acknowledges unmatched app events without dispatching', async () => {
    const frogbot = {
      config: { _internal: { triggers: { echo: { instance, subscribers: [appSubscriber] } } } },
      queue: vi.fn(),
    };
    const req = Object.assign(request({ event: 'unknown' }), { frogbot });
    await expect(post.handler(req as never)).resolves.toMatchObject({ status: 200 });
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown instance', async () => {
    const req = Object.assign(request({}), {
      frogbot: { config: { _internal: { triggers: {} } } },
    });
    await expect(post.handler(req as never)).resolves.toMatchObject({ status: 404 });
  });
});
