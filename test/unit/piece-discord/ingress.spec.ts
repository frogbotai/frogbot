import { generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { CHANNEL_TASK_SLUG, getChannelHost } from '../../../packages/frogbot/src/channels/host.js';
import type { ChannelTaskInput } from '../../../packages/frogbot/src/channels/types.js';
import { buildTriggerEndpoints } from '../../../packages/frogbot/src/triggers/endpoints.js';
import { buildIngressRegistry } from '../../../packages/frogbot/src/triggers/registry.js';
import { AGENT_TRIGGER_TASK_SLUG } from '../../../packages/frogbot/src/triggers/task.js';
import { createDiscord } from '../../../packages/pieces/piece-discord/src/index.js';
import { ingressFixture } from '../frogbot/channels/ingress.js';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey
  .export({ type: 'spki', format: 'der' })
  .subarray(-32)
  .toString('hex');
const post = buildTriggerEndpoints().find(
  ({ method, path }) => method === 'post' && path === '/webhooks/:instance',
)!;

const fixtures: ReturnType<typeof ingressFixture>[] = [];

function fixture(conversational = false) {
  const instance = createDiscord({
    auth: { botToken: 'bot-token' },
    applicationId: 'app-id',
    publicKey,
  });

  const result = ingressFixture({
    instance,
    triggerSlugs: ['commandReceived', 'componentReceived', 'messageCreated'],
    conversational,
  });

  fixtures.push(result);

  return result;
}

function signed(body: object, valid = true) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(timestamp + raw), keys.privateKey).toString('hex');

  return {
    raw,
    headers: {
      'x-signature-timestamp': timestamp,
      'x-signature-ed25519': valid ? signature : '0'.repeat(128),
    },
  };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.shutdown()));

  vi.restoreAllMocks();
});

describe('Discord adapter-verified ingress', () => {
  it.each([false, true])('answers a signed PING with channel mounted = %s', async (channel) => {
    const { initialize, request, frogbot } = fixture(channel);
    const { raw, headers } = signed({ type: 1 });

    await initialize();

    const response = await post.handler(request(raw, headers) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it.each([false, true])('authenticates commands, channel = %s', async (channel) => {
    const { initialize, request, frogbot } = fixture(channel);
    const { raw, headers } = signed({
      type: 2,
      id: 'interaction-1',
      application_id: 'app-id',
      channel_id: 'channel-1',
      token: 'interaction-token',
      user: { id: 'user-1', username: 'frog' },
      data: { name: 'hello', type: 1 },
    });

    await initialize();

    const response = await post.handler(request(raw, headers) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 5 });
    expect(frogbot.queue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        task: AGENT_TRIGGER_TASK_SLUG,
        input: expect.objectContaining({
          agentSlug: 'ops',
          instanceSlug: 'discord',
          triggerSlug: 'commandReceived',
          event: expect.objectContaining({ data: JSON.parse(raw) }),
        }),
      }),
    );
  });

  it.each(['invalid', 'missing', 'tampered'])('rejects %s signatures', async (kind) => {
    const { initialize, request, frogbot } = fixture();
    const { raw, headers } = signed({ type: 1 }, kind !== 'invalid');

    await initialize();

    const response = await post.handler(
      request(kind === 'tampered' ? `${raw} ` : raw, kind === 'missing' ? {} : headers) as never,
    );

    expect(response.status).toBe(401);
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('fans out one verified delivery to subscribers sharing the instance', async () => {
    const { initialize, request, frogbot } = fixture();
    const agent = frogbot.agents.ops.config;
    const { raw, headers } = signed({
      type: 2,
      id: 'shared-interaction',
      application_id: 'app-id',
      channel_id: 'channel-1',
      token: 'interaction-token',
      user: { id: 'user-1', username: 'frog' },
      data: { name: 'hello', type: 1 },
    });

    frogbot.config._internal.triggers = buildIngressRegistry({
      agents: [agent, { ...agent, slug: 'audit' }],
    });

    await initialize();

    const response = await post.handler(request(raw, headers) as never);

    expect(response.status).toBe(200);
    expect(frogbot.queue).toHaveBeenCalledTimes(2);
    expect(frogbot.queue.mock.calls.map(([job]) => [job.task, job.input.agentSlug])).toEqual(
      expect.arrayContaining([
        [AGENT_TRIGGER_TASK_SLUG, 'ops'],
        [AGENT_TRIGGER_TASK_SLUG, 'audit'],
      ]),
    );
  });

  it.each([false, true])('authenticates Gateway messages, channel = %s', async (conversational) => {
    const { initialize, request, frogbot } = fixture(conversational);
    const raw = JSON.stringify({
      type: 'GATEWAY_MESSAGE_CREATE',
      data: {
        id: 'message-1',
        channel_id: 'dm-channel',
        channel_type: 1,
        author: { id: 'user-1', username: 'frog', bot: false },
        content: 'Hello',
        timestamp: '2026-09-15T12:00:00Z',
        mentions: [],
        attachments: [],
      },
    });

    await initialize();

    const rejected = await post.handler(
      request(raw, { 'x-discord-gateway-token': 'wrong-token' }) as never,
    );

    expect(rejected.status).toBe(401);
    expect(frogbot.queue).not.toHaveBeenCalled();

    const accepted = await post.handler(
      request(raw, { 'x-discord-gateway-token': 'bot-token' }) as never,
    );

    expect(accepted.status).toBe(200);
    expect(frogbot.queue.mock.calls.map(([job]) => job.task)).toEqual(
      conversational ? [CHANNEL_TASK_SLUG, AGENT_TRIGGER_TASK_SLUG] : [AGENT_TRIGGER_TASK_SLUG],
    );
  });

  it.each([
    { auth: undefined, applicationId: 'app-id', publicKey, error: 'factory credentials' },
    { auth: { botToken: 'bot-token' }, error: 'applicationId and publicKey' },
  ])('requires complete bot config (%j)', async ({ error, ...options }) => {
    const instance = createDiscord(options);
    const result = ingressFixture({ instance, triggerSlugs: ['commandReceived'] });

    fixtures.push(result);

    await expect(result.initialize()).rejects.toThrow(error);

    expect(getChannelHost(result.frogbot as never)).toBeUndefined();
  });

  it.each([false, true])('requires a ready host/binding (%s)', async (initialized) => {
    const { initialize, request, frogbot } = fixture();
    const { raw, headers } = signed({ type: 1 });

    if (initialized) {
      const registry = frogbot.config._internal.triggers;

      frogbot.config._internal.triggers = {};

      await initialize();

      frogbot.config._internal.triggers = registry;
    }

    const response = await post.handler(request(raw, headers) as never);

    expect(response.status).toBe(503);
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('rejects conversational tasks for an ingress-only binding', async () => {
    const { initialize, frogbot } = fixture();

    await initialize();

    const host = getChannelHost(frogbot as never)!;

    await expect(
      host.run({ agentSlug: 'ops', instanceSlug: 'discord' } as ChannelTaskInput),
    ).rejects.toThrow("Channel binding 'ops:discord' is unavailable");

    expect(frogbot.queue).not.toHaveBeenCalled();
  });
});
