import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

const host = vi.hoisted(() => ({ webhook: vi.fn() }));

vi.mock('../../../packages/frogbot/src/channels/host.js', () => ({
  getChannelHost: () => host,
}));

import { buildTriggerEndpoints } from '../../../packages/frogbot/src/triggers/endpoints.js';
import { buildIngressRegistry } from '../../../packages/frogbot/src/triggers/registry.js';
import { createGithub } from '../../../packages/pieces/piece-github/src/index.js';

const factorySecret = 'github-app-secret';
const subscriptionSecret = 'github-subscription-secret';
const body = '{\n  "action": "opened", "issue": { "number": 12, "title": "héllo" }\n}';
const post = buildTriggerEndpoints().find(
  ({ path, method }) => path === '/webhooks/:instance' && method === 'post',
)!;

const subscribedPost = buildTriggerEndpoints().find(({ path }) => path.endsWith('/:subscription'))!;

function fixture({ channel = false, webhookSecret = factorySecret } = {}) {
  const auth = channel
    ? { appId: '12345', privateKey: 'private-key', installationId: 67890 }
    : { accessToken: 'repository-token' };

  const instance = createGithub({
    slug: 'github-ops',
    auth,
    webhookSecret: webhookSecret || undefined,
  });

  const triggers = buildIngressRegistry({
    agents: [
      {
        slug: 'ops',
        channels: channel ? [instance] : [],
        triggers: [
          {
            trigger: instance.triggers.issueActivity,
            input: { repository: { owner: 'frogbotai', repo: 'frogbot' } },
            handler: vi.fn(),
          },
        ],
      },
    ] as never,
  });

  const row = {
    id: 42,
    instance: instance.slug,
    agent: 'ops',
    trigger: 'issueActivity',
    status: 'active',
    input: { value: { repository: { owner: 'frogbotai', repo: 'frogbot' } } },
    state: {
      secret: subscriptionSecret,
      events: ['issues'],
      hookId: 12,
      owner: 'frogbotai',
      repo: 'frogbot',
    },
  };

  const frogbot = {
    config: { _internal: { triggers } },
    find: vi.fn().mockResolvedValue({ docs: [row] }),
    connections: {
      resolvePieceCredential: vi.fn().mockResolvedValue({
        auth,
        key: instance,
      }),
    },
    kv: {
      has: vi.fn().mockResolvedValue(false),
      setIfAbsent: vi.fn().mockResolvedValue(true),
      lock: vi.fn(async (_key, _ttl, run) => run({ signal: new AbortController().signal })),
    },
    queue: vi.fn(),
  };

  const request = ({ secret = subscriptionSecret, subscription = '42', raw = body } = {}) =>
    Object.assign(
      new Request(
        `https://example.com/api/webhooks/${instance.slug}${subscription ? `/${subscription}` : ''}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-github-event': 'issues',
            'x-github-delivery': 'delivery-42',
            'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
          },
          body: raw,
        },
      ),
      {
        frogbot,
        context: {},
        user: { id: 7, collection: 'users' },
        routeParams: { instance: instance.slug, ...(subscription ? { subscription } : {}) },
      },
    );

  return { frogbot, request };
}

beforeEach(() => {
  host.webhook.mockReset().mockImplementation(async () => Response.json({ channel: true }));
});

describe('GitHub subscription ingress', () => {
  it.each([false, true])(
    'verifies the persisted subscription secret with channel mounted = %s',
    async (channel) => {
      const { frogbot, request } = fixture({
        channel,
        webhookSecret: channel ? factorySecret : '',
      });

      const req = request();

      const response = await subscribedPost.handler(req as never);

      expect(response.status).toBe(200);
      expect(frogbot.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            and: [{ id: { equals: '42' } }, { instance: { equals: 'github-ops' } }],
          },
        }),
      );
      expect(frogbot.queue).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          input: expect.objectContaining({
            agentSlug: 'ops',
            triggerSlug: 'issueActivity',
            event: { dedupeKey: 'delivery-42:0', data: JSON.parse(body) },
          }),
        }),
      );
      expect(frogbot.connections.resolvePieceCredential).toHaveBeenCalledWith(
        expect.objectContaining({ req: expect.objectContaining({ user: null }) }),
      );
      expect(host.webhook).not.toHaveBeenCalled();
      expect(await req.text()).toBe(body);
    },
  );

  it.each([factorySecret, 'another-subscription-secret'])(
    'rejects subscription deliveries signed with %s',
    async (secret) => {
      const { frogbot, request } = fixture({ channel: true });

      await expect(subscribedPost.handler(request({ secret }) as never)).rejects.toMatchObject({
        errors: [expect.objectContaining({ message: 'GitHub webhook signature is invalid.' })],
      });

      expect(frogbot.queue).not.toHaveBeenCalled();
      expect(host.webhook).not.toHaveBeenCalled();
    },
  );

  it('does not dispatch a subscription belonging to another instance', async () => {
    const { frogbot, request } = fixture();

    frogbot.find.mockResolvedValue({ docs: [] });

    const response = await subscribedPost.handler(request({ subscription: 'foreign' }) as never);

    expect(response.status).toBe(404);
    expect(frogbot.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [{ id: { equals: 'foreign' } }, { instance: { equals: 'github-ops' } }],
        },
      }),
    );
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('rejects a modified body even when the subscription signature was originally valid', async () => {
    const { frogbot, request } = fixture();
    const req = request({ raw: body.replace('héllo', 'modified') });

    req.headers.set(
      'x-hub-signature-256',
      `sha256=${createHmac('sha256', subscriptionSecret).update(body).digest('hex')}`,
    );

    await expect(subscribedPost.handler(req as never)).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'GitHub webhook signature is invalid.' })],
    });

    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('keeps shared channel ingress on the factory secret and out of subscription dispatch', async () => {
    const { frogbot, request } = fixture({ channel: true });

    const rejected = await post.handler(request({ subscription: '' }) as never);
    const accepted = await post.handler(
      request({ subscription: '', secret: factorySecret }) as never,
    );

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ channel: true });
    expect(host.webhook).toHaveBeenCalledOnce();
    expect(frogbot.find).not.toHaveBeenCalled();
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it.each([false, true])('fails closed without a factory secret, channel = %s', async (channel) => {
    const { frogbot, request } = fixture({ channel, webhookSecret: '' });

    const response = await post.handler(request({ subscription: '' }) as never);

    expect(response.status).toBe(401);
    expect(host.webhook).not.toHaveBeenCalled();
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('does not treat a query-string subscription as a subscription route', async () => {
    const { frogbot, request } = fixture({ channel: true });
    const req = Object.assign(request({ subscription: '' }), { query: { subscription: '42' } });

    const response = await post.handler(req as never);

    expect(response.status).toBe(401);
    expect(frogbot.find).not.toHaveBeenCalled();
    expect(host.webhook).not.toHaveBeenCalled();
  });

  it('preserves a channel-host rejection after factory verification', async () => {
    const { frogbot, request } = fixture({ channel: true });

    host.webhook.mockResolvedValue(new Response('Rejected by adapter', { status: 401 }));

    const response = await post.handler(
      request({ subscription: '', secret: factorySecret }) as never,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Rejected by adapter');
    expect(frogbot.queue).not.toHaveBeenCalled();
  });
});
