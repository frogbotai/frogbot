import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { pieceInstanceRuntime } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createLinear } from '../../../packages/pieces/piece-linear/src/index.js';
import { issueCreated } from '../../../packages/pieces/piece-linear/src/triggers/issueCreated.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

const webhookSecret = 'linear-webhook-signing-secret';
const now = 1_789_200_000_000;
const delivery = { action: 'create', type: 'Issue', data: { id: 'issue', title: 'Hello 🐸' } };
const payload = (webhookTimestamp: unknown = now) =>
  JSON.stringify({ ...delivery, webhookTimestamp });
const sign = ({ body, secret = webhookSecret }: { body: string; secret?: string }) =>
  createHmac('sha256', secret).update(body).digest('hex');

function request({ body = payload(), signature = sign({ body }) } = {}) {
  return new Request('https://example.com/api/webhooks/linear/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Linear-Signature': signature },
    body,
  }) as FrogBotRequest;
}

function verify(req: FrogBotRequest) {
  const runtime = pieceInstanceRuntime(createLinear({ webhookSecret }));
  return runtime.definition.webhook!.verify({ req, options: runtime.options as object });
}

const graphQL = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Linear webhook verification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it.each([-60_000, 0, 60_000])('accepts a signed timestamp offset by %i ms', async (offset) => {
    await expect(verify(request({ body: payload(now + offset) }))).resolves.toBe(true);
  });

  it('verifies the exact raw bytes, including whitespace and Unicode', async () => {
    const body = `\n${JSON.stringify({ ...delivery, webhookTimestamp: now }, null, 2)}\n`;
    const req = request({ body });
    req.data = { webhookTimestamp: 0 };
    await expect(
      verify(Object.assign(req.clone!(), { data: req.data }) as FrogBotRequest),
    ).resolves.toBe(true);
    await expect(req.text!()).resolves.toBe(body);
    await expect(verify(request({ body: payload(), signature: sign({ body }) }))).resolves.toBe(
      false,
    );
  });

  it('rejects altered payloads and signatures made with another secret', async () => {
    await expect(
      verify(
        request({
          body: payload().replace('Hello', 'Forged'),
          signature: sign({ body: payload() }),
        }),
      ),
    ).resolves.toBe(false);
    await expect(
      verify(request({ signature: sign({ body: payload(), secret: 'another-secret' }) })),
    ).resolves.toBe(false);
  });

  it.each(['', 'a', '0'.repeat(63), '0'.repeat(64), 'g'.repeat(64), '0'.repeat(65)])(
    'rejects a missing or invalid signature %j',
    async (signature) => {
      const req = request({ signature });
      if (!signature) req.headers.delete('linear-signature');
      await expect(verify(req)).resolves.toBe(false);
    },
  );

  it.each([now - 60_001, now + 60_001, 0, -1, null, `${now}`, now + 0.5, Number.MAX_VALUE])(
    'rejects a signed invalid timestamp %j',
    async (timestamp) => {
      const req = request({ body: payload(timestamp) });
      req.headers.set('linear-timestamp', String(now));
      req.data = { ...delivery, webhookTimestamp: now };
      await expect(verify(req)).resolves.toBe(false);
    },
  );

  it.each(['{', 'null', '[]', 'true', JSON.stringify(delivery)])(
    'rejects signed invalid JSON or a missing body timestamp: %s',
    async (body) => {
      const req = request({ body });
      req.headers.set('linear-timestamp', String(now));
      await expect(verify(req)).resolves.toBe(false);
    },
  );

  it('fails closed without a configured secret', async () => {
    const runtime = pieceInstanceRuntime(createLinear());
    await expect(
      runtime.definition.webhook!.verify({ req: request(), options: runtime.options as object }),
    ).resolves.toBe(false);
  });

  it('fails closed when the raw body is unavailable', async () => {
    const req = request();
    await req.text!();
    await expect(verify(req)).resolves.toBe(false);
  });
});

describe('Linear webhook lifecycle', () => {
  it('passes the signing secret through the real SDK and deletes the registered webhook', async () => {
    const fetch = vi.fn().mockImplementation(async () =>
      graphQL({
        webhookCreate: { success: true, lastSyncId: 1, webhook: { id: 'hook' } },
        webhook: { id: 'hook' },
        webhookDelete: { success: true, lastSyncId: 2, entityId: 'hook' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const auth = { apiKey: 'lin_api_test' };
    const linear = createLinear({ auth, webhookSecret });
    const req = {
      frogbot: {
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
      },
      user: null,
    } as unknown as FrogBotRequest;
    const client = await linear.client({ req });
    const args = { client, input: { teamId: 'team' }, options: { webhookSecret }, req };
    const state = await issueCreated.onEnable({
      ...args,
      webhookUrl: 'https://example.com/api/webhooks/linear/subscription',
    });
    expect(state).toEqual({ webhookId: 'hook' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      query: expect.stringContaining('WebhookCreate'),
      variables: {
        input: {
          label: 'FrogBot issueCreated',
          url: 'https://example.com/api/webhooks/linear/subscription',
          resourceTypes: ['Issue'],
          teamId: 'team',
          secret: webhookSecret,
        },
      },
    });
    await issueCreated.onDisable({ ...args, state });
    expect(JSON.parse(fetch.mock.calls.at(-1)?.[1]?.body as string)).toMatchObject({
      query: expect.stringContaining('mutation deleteWebhook'),
      variables: { id: 'hook' },
    });
  });

  it('requires a secret before attempting registration', async () => {
    const client = { createWebhook: vi.fn() };
    await expect(
      issueCreated.onEnable({
        client,
        input: { teamId: 'team' },
        options: {},
        webhookUrl: 'https://example.com/hook',
      } as never),
    ).rejects.toThrow('Linear issueCreated webhook requires createLinear({ webhookSecret }).');
    expect(client.createWebhook).not.toHaveBeenCalled();
  });

  it.each([
    { success: false, webhook: Promise.resolve({ id: 'hook' }) },
    { success: true, webhook: undefined },
    { success: true, webhook: Promise.resolve(undefined) },
  ])('reports an unsuccessful registration', async (response) => {
    await expect(
      issueCreated.onEnable({
        client: { createWebhook: vi.fn().mockResolvedValue(response) },
        input: { teamId: 'team' },
        options: { webhookSecret },
        webhookUrl: 'https://example.com/hook',
      } as never),
    ).rejects.toThrow('Linear failed to create the issueCreated webhook.');
  });

  it('reports an unsuccessful deletion through the real SDK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        graphQL({
          webhookDelete: { success: false, lastSyncId: 1, entityId: 'hook' },
        }),
      ),
    );
    const definition = pieceInstanceRuntime(createLinear()).definition;
    const client = await definition.client!({ auth: { apiKey: 'lin_api_test' }, options: {} });
    await expect(
      issueCreated.onDisable({ client, state: { webhookId: 'hook' } } as never),
    ).rejects.toThrow("Linear failed to delete the issueCreated webhook 'hook'.");
  });

  it('sanitizes a mounted createLinear trigger with its verifier and factory options', async () => {
    const linear = createLinear({ auth: { apiKey: 'lin_api_test' }, webhookSecret });
    const mounted = {
      trigger: linear.triggers.issueCreated,
      input: { teamId: 'team' },
      handler: vi.fn(),
    };
    const config = await buildConfig({
      secret: 'test-secret',
      serverURL: 'https://example.com',
      db: { defaultIDType: 'number' } as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
      ai: { providers: { openai: { apiKey: 'sk-test' } } },
      agents: [
        { slug: 'ops', instructions: 'Handle events', model: 'openai/test', triggers: [mounted] },
      ],
    });
    await config._internal.payloadConfig;
    const entry = config._internal.triggers.linear;
    expect(entry.instance).toBe(linear);
    expect(entry.subscribers).toEqual([
      { agentSlug: 'ops', piece: linear, trigger: mounted, input: { teamId: 'team' } },
    ]);
    const runtime = pieceInstanceRuntime(entry.instance);
    expect(runtime.options).toEqual({ webhookSecret, channelMode: 'agent-sessions' });
    await expect(
      runtime.definition.webhook!.verify({
        req: request({ body: payload(Date.now()) }),
        options: runtime.options as object,
      }),
    ).resolves.toBe(true);
  });
});
