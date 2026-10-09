import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

vi.mock(
  'frogbot/pieces/test',
  () => import('../../../packages/frogbot/src/exports/pieces-test.js'),
);

import type { FrogBotRequest } from 'frogbot';
import { pieceConformance } from 'frogbot/pieces/test';

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  addRoleToMember,
  sendMessage,
} from '../../../packages/pieces/piece-discord/src/actions.js';
import { createDiscordClient } from '../../../packages/pieces/piece-discord/src/client.js';
import { discordOptions } from '../../../packages/pieces/piece-discord/src/config.js';
import {
  createDiscord,
  discordActions,
  discordTriggers,
} from '../../../packages/pieces/piece-discord/src/index.js';
import { conformanceChannelState } from '../frogbot/pieces/channelState.js';

const req = (auth = { botToken: 'discord_test_token' }) =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-request-id': 'request' },
  });
}

function empty(status = 204) {
  return new Response(null, { status });
}

function discordPiece() {
  return createDiscord({ auth: { botToken: 'discord_test_token' } });
}

function appTrigger(event: string) {
  const trigger = pieceFactoryDefinition(createDiscord).triggers?.find(
    (candidate) => candidate.slug === event,
  );

  if (!trigger || trigger.type !== 'app') throw new Error(`Missing Discord trigger '${event}'.`);

  return trigger;
}

afterEach(() => vi.unstubAllGlobals());

describe('discord', () => {
  it('passes channel conformance with the official Gateway adapter', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyHex = publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('hex');

    const body = await readFile(new URL('./fixtures/ping.json', import.meta.url), 'utf8');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
    const gatewayBody = await readFile(new URL('./fixtures/message.json', import.meta.url), 'utf8');

    await pieceConformance(createDiscord, {
      factoryOptions: {
        auth: { botToken: 'discord_test_token' },
        applicationId: '123456789',
        publicKey: publicKeyHex,
      },
      actions: discordActions.map((slug) => ({ slug, input: {}, expect: { error: /./ } })),
      triggers: discordTriggers.map((slug) => ({ slug, type: 'app' as const })),
      channel: {
        adapter: { name: 'discord' },
        identity: {
          author: { userId: '42', userName: 'frog', fullName: 'Frog', isBot: false, isMe: false },
          req: {} as FrogBotRequest,
          expect: null,
        },
        webhook: {
          state: conformanceChannelState(),
          requests: [
            {
              request: {
                headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
                body,
                data: JSON.parse(body),
              },
              verified: true,
              delivery: { status: 200, body: '{"type":1}', messages: [] },
            },
            {
              request: {
                headers: {
                  'x-signature-ed25519': '00'.repeat(64),
                  'x-signature-timestamp': timestamp,
                },
                body,
                data: JSON.parse(body),
              },
              verified: false,
              delivery: { status: 401, messages: [] },
            },
            {
              request: {
                headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
                body: body.replace('987654321', '987654322'),
              },
              verified: false,
              delivery: { status: 401, messages: [] },
            },
            {
              request: {
                headers: { 'x-discord-gateway-token': 'discord_test_token' },
                body: gatewayBody,
                data: JSON.parse(gatewayBody),
              },
              verified: true,
              event: 'messageCreated',
              delivery: {
                status: 200,
                messages: [
                  {
                    id: '147000000000000001',
                    threadId: 'discord:123456789:147000000000000002:147000000000000003',
                    text: 'Hello FrogBot',
                    authorId: '42',
                  },
                ],
              },
            },
            {
              request: {
                headers: { 'x-discord-gateway-token': 'wrong-token' },
                body: gatewayBody,
                data: JSON.parse(gatewayBody),
              },
              verified: false,
              delivery: { status: 401, messages: [] },
            },
          ],
        },
      },
    });

    const definition = pieceFactoryDefinition(createDiscord);
    const adapter = definition.channel?.adapter({
      auth: { botToken: 'discord_test_token' },
      options: {
        applicationId: '123456789',
        publicKey: publicKeyHex,
        mentionRoleIds: [],
        respondToChannelIds: [],
        respondToGlobalMentions: false,
      },
    });

    expect(adapter).toHaveProperty('startGatewayListener', expect.any(Function));
  });

  it('verifies recorded interactions with Discord Ed25519 signatures', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyHex = publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('hex');

    const body = await readFile(new URL('./fixtures/ping.json', import.meta.url), 'utf8');
    const timestamp = '1789344000';
    const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
    const definition = pieceFactoryDefinition(createDiscord);
    const adapter = definition.channel?.adapter({
      auth: { botToken: 'discord_test_token' },
      options: {
        applicationId: '123456789',
        publicKey: publicKeyHex,
        mentionRoleIds: [],
        respondToChannelIds: [],
        respondToGlobalMentions: false,
      },
    });

    const request = new Request('https://example.com/api/webhooks/discord', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature-ed25519': signature,
        'x-signature-timestamp': timestamp,
      },
      body,
    });

    await expect(adapter?.handleWebhook(request)).resolves.toMatchObject({ status: 200 });

    const invalidRequest = new Request('https://example.com/api/webhooks/discord', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature-ed25519': '00'.repeat(64),
        'x-signature-timestamp': timestamp,
      },
      body,
    });

    await expect(adapter?.handleWebhook(invalidRequest)).resolves.toMatchObject({ status: 401 });
  });

  it.each([
    [2, 'commandReceived', { id: 'interaction', type: 2 }, 'commandReceived:interaction'],
    [3, 'componentReceived', { id: 'interaction', type: 3 }, 'componentReceived:interaction'],
    [
      'GATEWAY_MESSAGE_CREATE',
      'messageCreated',
      { type: 'GATEWAY_MESSAGE_CREATE', data: { id: 'message' } },
      'messageCreated:message',
    ],
    [
      'GATEWAY_MESSAGE_REACTION_ADD',
      'reactionAdded',
      {
        type: 'GATEWAY_MESSAGE_REACTION_ADD',
        data: { message_id: 'message', user_id: 'user', emoji: { id: null, name: 'frog' } },
      },
      'reactionAdded:message:user:frog',
    ],
    [
      'GATEWAY_MESSAGE_REACTION_REMOVE',
      'reactionRemoved',
      {
        type: 'GATEWAY_MESSAGE_REACTION_REMOVE',
        data: { message_id: 'message', user_id: 'user', emoji: { id: 'emoji', name: 'frog' } },
      },
      'reactionRemoved:message:user:emoji',
    ],
  ])('maps Discord delivery %s to %s', async (type, event, delivery, dedupeKey) => {
    const definition = pieceFactoryDefinition(createDiscord);

    expect(definition.webhook?.parse?.({ req: { data: { type } } as never })).toEqual({ event });

    const events = await appTrigger(event).run({
      client: {},
      input: {},
      options: {},
      req: { data: delivery } as never,
    });

    expect(events).toEqual([
      {
        data: delivery,
        dedupeKey,
      },
    ]);
  });

  it.each(discordTriggers)('filters %s deliveries without a stable platform key', async (event) => {
    await expect(
      appTrigger(event).run({
        client: {},
        input: {},
        options: {},
        req: { data: { type: event, data: {} } } as never,
      }),
    ).resolves.toEqual([]);
  });

  it('exposes every semantic action and trigger', () => {
    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });

    expect(pieceInstanceTools(discord)?.map(({ slug }) => slug)).toEqual(
      discordActions.map((slug) => `discord_${slug}`),
    );
    expect(Object.keys(discord.triggers)).toEqual(discordTriggers);
  });

  it.each([
    {
      slug: 'addRoleToMember',
      call: () =>
        discordPiece().addRoleToMember({
          input: { guildId: 'g', userId: 'u', roleId: 'r' },
          req: req(),
        }),
      method: 'PUT',
      path: '/guilds/g/members/u/roles/r',
    },
    {
      slug: 'removeRoleFromMember',
      call: () =>
        discordPiece().removeRoleFromMember({
          input: { guildId: 'g', userId: 'u', roleId: 'r' },
          req: req(),
        }),
      method: 'DELETE',
      path: '/guilds/g/members/u/roles/r',
    },
    {
      slug: 'removeMember',
      call: () => discordPiece().removeMember({ input: { guildId: 'g', userId: 'u' }, req: req() }),
      method: 'DELETE',
      path: '/guilds/g/members/u',
    },
    {
      slug: 'unbanMember',
      call: () =>
        discordPiece().unbanMember({
          input: { guildId: 'g', userId: 'u', reason: 'appeal' },
          req: req(),
        }),
      method: 'DELETE',
      path: '/guilds/g/bans/u',
    },
    {
      slug: 'banMember',
      call: () =>
        discordPiece().banMember({
          input: { guildId: 'g', userId: 'u', reason: 'spam' },
          req: req(),
        }),
      method: 'PUT',
      path: '/guilds/g/bans/u',
    },
    {
      slug: 'deleteRole',
      call: () =>
        discordPiece().deleteRole({
          input: { guildId: 'g', roleId: 'r', reason: 'unused' },
          req: req(),
        }),
      method: 'DELETE',
      path: '/guilds/g/roles/r',
    },
  ])('maps $slug to the Discord endpoint', async ({ call, method, path }) => {
    const fetch = vi.fn().mockResolvedValue(empty());
    vi.stubGlobal('fetch', fetch);

    await call();

    expect(fetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10${path}`,
      expect.objectContaining({ method, headers: expect.any(Headers) }),
    );

    const headers = fetch.mock.calls[0]?.[1]?.headers as Headers;

    expect(headers.get('authorization')).toBe('Bot discord_test_token');
  });

  it('maps message, webhook, channel, member, and role actions', async () => {
    const respond = (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;

      if (path.endsWith('/members')) return json([{ user: { id: 'u', username: 'Frog' } }]);
      if (path.endsWith('/channels') && init.method === 'GET') {
        return json([{ id: 'c', name: 'general' }]);
      }

      if (path.endsWith('/channels')) return json({ id: 'c', name: 'general' }, 201);
      if (path.endsWith('/roles')) return json({ id: 'r', name: 'moderator' }, 201);
      if (path.endsWith('/webhooks/1')) return empty();

      return json({ id: 'c', name: 'renamed', content: 'sent' });
    };

    const fetch = vi
      .fn()
      .mockImplementation((url: string, init: RequestInit) => Promise.resolve(respond(url, init)));

    vi.stubGlobal('fetch', fetch);

    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });

    await expect(
      discord.sendMessage({
        input: { channelId: 'c', message: 'hello', attachments: [] },
        req: req(),
      }),
    ).resolves.toMatchObject({ content: 'sent' });
    await expect(
      discord.sendWebhookMessage({
        input: {
          webhookUrl: 'https://discord.com/api/webhooks/1/token',
          content: 'hello',
          embeds: [],
          tts: false,
        },
        req: req(),
      }),
    ).resolves.toEqual({ success: true });
    await expect(
      discord.requestApproval({
        input: {
          channelId: 'c',
          message: 'Approve deployment?',
          reviewUrl: 'https://example.com/review/1',
        },
        req: req(),
      }),
    ).resolves.toMatchObject({ content: 'sent' });

    const approvalCall = fetch.mock.calls.at(-1);

    await expect(
      discord.listMembers({ input: { guildId: 'g', search: 'fro' }, req: req() }),
    ).resolves.toEqual([{ label: 'Frog', value: 'u' }]);
    await expect(
      discord.findChannel({ input: { guildId: 'g', name: 'general' }, req: req() }),
    ).resolves.toEqual({ success: true, channelId: 'c' });
    await expect(
      discord.renameChannel({ input: { channelId: 'c', name: 'renamed' }, req: req() }),
    ).resolves.toMatchObject({ name: 'renamed' });
    await expect(
      discord.createChannel({ input: { guildId: 'g', name: 'general' }, req: req() }),
    ).resolves.toEqual({ success: true, channel: { id: 'c', name: 'general' } });
    await expect(
      discord.deleteChannel({ input: { channelId: 'c' }, req: req() }),
    ).resolves.toMatchObject({ id: 'c' });
    await expect(
      discord.createRole({ input: { guildId: 'g', name: 'moderator' }, req: req() }),
    ).resolves.toEqual({ success: true, role: { id: 'r', name: 'moderator' } });

    const webhookHeaders = fetch.mock.calls.find(([url]) =>
      String(url).includes('/webhooks/1/token'),
    )?.[1]?.headers as Headers;

    expect(webhookHeaders.has('authorization')).toBe(false);

    expect(JSON.parse(approvalCall?.[1]?.body as string)).toMatchObject({
      content: 'Approve deployment?',
      components: [{ components: [{ style: 5, url: 'https://example.com/review/1' }] }],
    });
  });

  it('keeps custom API calls on Discord and returns the response envelope', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ id: 'g' }));
    vi.stubGlobal('fetch', fetch);

    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });
    const result = await discord.sendApiRequest({
      input: {
        path: '/users/@me',
        method: 'GET',
        headers: {},
        queryParams: { with_counts: true },
      },
      req: req(),
    });

    expect(fetch.mock.calls[0]?.[0]).toBe('https://discord.com/api/v10/users/@me?with_counts=true');
    expect(result).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'request' },
      body: { id: 'g' },
    });
    await expect(
      discord.sendApiRequest({
        input: { path: 'https://attacker.example', method: 'GET', headers: {}, queryParams: {} },
        req: req(),
      }),
    ).rejects.toThrow('Path must be relative');
  });

  it('sends the bot token only to the configured API origin', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ id: 'g' })));
    vi.stubGlobal('fetch', fetch);

    const client = createDiscordClient({
      auth: { botToken: 'discord_test_token' },
      options: { apiUrl: 'https://discord.proxy.test/api/v10/' },
    });

    await client.request({ path: '/users/@me' });
    await client.request({ path: 'https://x.test/webhook', authenticated: false });

    await expect(client.request({ path: 'https://x.test/users/@me' })).rejects.toThrow(
      'Discord request URL must stay on https://discord.proxy.test.',
    );
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://discord.proxy.test/api/v10/users/@me',
      'https://x.test/webhook',
    ]);
  });

  it('loads dynamic guild, channel, and role choices', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([{ id: 'g', name: 'Guild' }]))
      .mockResolvedValueOnce(json([{ id: 'g', name: 'Guild' }]))
      .mockResolvedValueOnce(json([{ id: 'c', name: 'Channel' }]))
      .mockResolvedValueOnce(json([{ id: 'r', name: 'Role' }]));

    vi.stubGlobal('fetch', fetch);

    const client = await discordPiece().client({ req: req() });
    const options = discordOptions.parse({});

    await expect(
      addRoleToMember.options?.guildId?.({ input: {}, client, options, req: req() }),
    ).resolves.toEqual([{ label: 'Guild', value: 'g' }]);
    await expect(
      sendMessage.options?.channelId?.({ input: {}, client, options, req: req() }),
    ).resolves.toEqual([{ label: 'Channel', value: 'c' }]);
    await expect(
      addRoleToMember.options?.roleId?.({ input: { guildId: 'g' }, client, options, req: req() }),
    ).resolves.toEqual([{ label: 'Role', value: 'r' }]);
  });

  it('surfaces Discord API errors without exposing the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Missing Access' }, 403)));

    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });

    await expect(
      discord.removeMember({ input: { guildId: 'g', userId: 'u' }, req: req() }),
    ).rejects.toThrow('Discord request failed (403): Missing Access');
  });
});
