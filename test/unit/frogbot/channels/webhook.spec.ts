import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { buildIngressRegistry } from '../../../../packages/frogbot/src/triggers/registry.js';

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  getChannelHost: vi.fn(),
}));

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  addDataAndFileToRequest: vi.fn(async () => undefined),
}));

vi.mock('../../../../packages/frogbot/src/channels/host.js', () => ({
  getChannelHost: mocks.getChannelHost,
}));

const { buildTriggerEndpoints } =
  await import('../../../../packages/frogbot/src/triggers/endpoints.js');

const channelPiece = definePiece({
  slug: 'channel-only',
  label: 'Channel only',
  auth: z.object({ token: z.string() }),
  actions: [],
  client: ({ auth }) => auth,
  channel: {
    adapter: () => ({ name: 'channel-only' }) as never,
    identity: async () => null,
  },
});

function request() {
  const instance = channelPiece({ auth: { token: 'secret' } });
  const triggers = buildIngressRegistry({
    agents: [{ slug: 'support', instructions: 'Help', channels: [instance] }],
  });
  const frogbot = {
    config: { _internal: { triggers } },
    logger: { error: vi.fn() },
  };

  return Object.assign(
    new Request('http://localhost/api/webhooks/channel-only', { method: 'POST', body: '{}' }),
    {
      routeParams: { instance: 'channel-only' },
      frogbot,
      user: null,
    },
  );
}

describe('channel webhook ingress', () => {
  beforeEach(() => {
    mocks.webhook.mockReset().mockResolvedValue(new Response('accepted', { status: 202 }));
    mocks.getChannelHost.mockReset().mockReturnValue({ webhook: mocks.webhook });
  });

  it('routes channel-only instances through the public webhook endpoint', async () => {
    const endpoint = buildTriggerEndpoints().find(
      ({ path, method }) => path === '/webhooks/:instance' && method === 'post',
    )!;

    const response = await endpoint.handler(request() as never);

    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe('accepted');
    expect(mocks.webhook).toHaveBeenCalledWith('channel-only', expect.any(Request));
  });

  it.each([false, true])(
    'drains app-trigger enqueue before settling ingress (sibling failure: %s)',
    async (failSibling) => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const run = vi.fn(async ({ input }) => {
        if (input.fail) throw new Error('subscriber failed');

        await held;

        return [{ dedupeKey: 'delivery-1', data: { text: 'Hello' } }];
      });
      const sharedPiece = definePiece({
        slug: 'shared',
        label: 'Shared',
        auth: z.object({ token: z.string() }),
        actions: [],
        client: ({ auth }) => auth,
        webhook: {
          verify: async () => true,
          parse: () => ({ event: 'message' }),
        },
        triggers: [
          {
            slug: 'received',
            description: 'Receive',
            type: 'app',
            event: 'message',
            input: z.object({ fail: z.boolean().optional() }),
            run,
          },
        ],
        channel: {
          adapter: () => ({ name: 'shared' }) as never,
          identity: async () => null,
        },
      });
      const instance = sharedPiece({ auth: { token: 'secret' } });
      const trigger = {
        trigger: instance.triggers.received,
        handler: vi.fn(),
      };
      const triggers = buildIngressRegistry({
        agents: [
          {
            slug: 'support',
            instructions: 'Help',
            channels: [instance],
            triggers: failSibling ? [{ ...trigger, input: { fail: true } }, trigger] : [trigger],
          },
        ],
      });
      const queue = vi.fn(async () => undefined);
      const frogbot = {
        config: { _internal: { triggers } },
        connections: {
          resolvePieceCredential: vi.fn(async () => ({ auth: { token: 'secret' }, key: {} })),
        },
        logger: { error: vi.fn() },
        queue,
        kv: {
          has: vi.fn(async () => false),
          lock: vi.fn(async (_key, _ttl, callback) =>
            callback({ signal: new AbortController().signal }),
          ),
          setIfAbsent: vi.fn(async () => true),
        },
      };
      const req = Object.assign(
        new Request('http://localhost/api/webhooks/shared', { method: 'POST', body: '{}' }),
        { routeParams: { instance: 'shared' }, frogbot, user: null },
      );
      const endpoint = buildTriggerEndpoints().find(
        ({ path, method }) => path === '/webhooks/:instance' && method === 'post',
      )!;

      let acknowledged = false;
      const pending = endpoint.handler(req as never).then(
        (response) => {
          acknowledged = true;

          return response;
        },
        (error: unknown) => {
          acknowledged = true;

          return error;
        },
      );

      await vi.waitFor(() => {
        expect(frogbot.logger.error).not.toHaveBeenCalled();
        expect(run).toHaveBeenCalledTimes(failSibling ? 2 : 1);
      });

      expect(queue).not.toHaveBeenCalled();
      expect(acknowledged).toBe(false);

      release();

      const response = await pending;

      expect(queue).toHaveBeenCalledOnce();
      if (failSibling) {
        expect(response).toBeInstanceOf(AggregateError);
      } else {
        expect(response).toMatchObject({ status: 202 });
      }
    },
  );

  it('fails unavailable hosts and bindings instead of acknowledging channel work', async () => {
    const endpoint = buildTriggerEndpoints().find(({ method }) => method === 'post')!;

    mocks.getChannelHost.mockReturnValueOnce(undefined);

    expect((await endpoint.handler(request() as never)).status).toBe(503);
    expect(mocks.webhook).not.toHaveBeenCalled();

    mocks.webhook.mockResolvedValueOnce(undefined);

    expect((await endpoint.handler(request() as never)).status).toBe(503);
  });

  it('preserves adapter authentication failures', async () => {
    const endpoint = buildTriggerEndpoints().find(({ method }) => method === 'post')!;

    mocks.webhook.mockResolvedValueOnce(new Response('Invalid signature', { status: 401 }));

    expect((await endpoint.handler(request() as never)).status).toBe(401);
  });
});
