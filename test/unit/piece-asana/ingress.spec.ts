import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { buildTriggerEndpoints } from '../../../packages/frogbot/src/triggers/endpoints.js';
import { buildIngressRegistry } from '../../../packages/frogbot/src/triggers/registry.js';
import { createAsana } from '../../../packages/pieces/piece-asana/src/index.js';
import { json, stubAsana, token } from './fixtures.js';

const secret = 'hook-secret';
const subscribedPost = buildTriggerEndpoints().find(({ path }) => path.endsWith('/:subscription'))!;

function fixture(row: Record<string, unknown> = {}) {
  const instance = createAsana({ auth: token });

  const triggers = buildIngressRegistry({
    agents: [
      {
        slug: 'ops',
        triggers: [
          { trigger: instance.triggers.taskCreated, input: { projectGid: '30' }, handler: vi.fn() },
        ],
      },
    ] as never,
  });

  const frogbot = {
    config: { _internal: { triggers } },
    find: vi.fn().mockResolvedValue({
      docs: [
        {
          id: 42,
          instance: instance.slug,
          agent: 'ops',
          trigger: 'taskCreated',
          status: 'active',
          input: { value: { projectGid: '30' } },
          state: { webhookGid: '900', secret },
          ...row,
        },
      ],
    }),
    connections: {
      resolvePieceCredential: vi.fn().mockResolvedValue({ auth: token, key: instance }),
    },
    kv: {
      has: vi.fn().mockResolvedValue(false),
      setIfAbsent: vi.fn().mockResolvedValue(true),
      lock: vi.fn((_key, _ttl, run) =>
        Promise.resolve(run({ signal: new AbortController().signal })),
      ),
    },
    queue: vi.fn(),
  };

  const request = (raw: string, headers: Record<string, string>) =>
    Object.assign(
      new Request(`https://app.test/api/webhooks/${instance.slug}/42`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: raw,
      }),
      {
        frogbot,
        context: {},
        routeParams: { instance: instance.slug, subscription: '42' },
      },
    );

  return { frogbot, request };
}

afterEach(() => vi.unstubAllGlobals());

describe('Asana webhook ingress', () => {
  it('echoes X-Hook-Secret to a subscription still being enabled', async () => {
    const { frogbot, request } = fixture({ status: 'error', enablePending: true, state: null });

    const response = await subscribedPost.handler(
      request('', { 'x-hook-secret': 'handshake-secret' }) as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-hook-secret')).toBe('handshake-secret');
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('queues a signed delivery with the fetched task', async () => {
    stubAsana(() => json({ data: { gid: '40', name: 'Ship it' } }));

    const event = {
      action: 'added',
      resource: { gid: '40', resource_type: 'task' },
      parent: { gid: '30', resource_type: 'project' },
    };

    const raw = JSON.stringify({ events: [event] });
    const { frogbot, request } = fixture();

    const response = await subscribedPost.handler(
      request(raw, {
        'x-hook-signature': createHmac('sha256', secret).update(raw).digest('hex'),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(frogbot.queue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        input: expect.objectContaining({
          agentSlug: 'ops',
          triggerSlug: 'taskCreated',
          event: {
            dedupeKey: expect.any(String),
            data: { event, task: { gid: '40', name: 'Ship it' } },
          },
        }),
      }),
    );
  });
});
