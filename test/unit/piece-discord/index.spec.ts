import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceActionDefinition,
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createDiscord,
  discordActions,
  discordTriggers,
} from '../../../packages/pieces/piece-discord/src/index.js';

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

afterEach(() => vi.unstubAllGlobals());

describe('discord', () => {
  it('exposes every semantic action and trigger', () => {
    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });

    expect(pieceInstanceTools(discord)?.map(({ slug }) => slug)).toEqual(
      discordActions.map((slug) => `discord_${slug}`),
    );
    expect(Object.keys(discord.triggers)).toEqual(discordTriggers);
  });

  it.each([
    [
      'addRoleToMember',
      { guildId: 'g', userId: 'u', roleId: 'r' },
      'PUT',
      '/guilds/g/members/u/roles/r',
    ],
    [
      'removeRoleFromMember',
      { guildId: 'g', userId: 'u', roleId: 'r' },
      'DELETE',
      '/guilds/g/members/u/roles/r',
    ],
    ['removeMember', { guildId: 'g', userId: 'u' }, 'DELETE', '/guilds/g/members/u'],
    ['unbanMember', { guildId: 'g', userId: 'u', reason: 'appeal' }, 'DELETE', '/guilds/g/bans/u'],
    ['banMember', { guildId: 'g', userId: 'u', reason: 'spam' }, 'PUT', '/guilds/g/bans/u'],
    ['deleteRole', { guildId: 'g', roleId: 'r', reason: 'unused' }, 'DELETE', '/guilds/g/roles/r'],
  ] as const)('maps %s to the Discord endpoint', async (slug, input, method, path) => {
    const fetch = vi.fn().mockResolvedValue(empty());
    vi.stubGlobal('fetch', fetch);

    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });
    await discord[slug]({ input, req: req() });

    expect(fetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10${path}`,
      expect.objectContaining({ method, headers: expect.any(Headers) }),
    );
    const headers = fetch.mock.calls[0]?.[1]?.headers as Headers;

    expect(headers.get('authorization')).toBe('Bot discord_test_token');
  });

  it('maps message, webhook, channel, member, and role actions', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;

      if (path.endsWith('/members')) return json([{ user: { id: 'u', username: 'Frog' } }]);
      if (path.endsWith('/channels') && init.method === 'GET') {
        return json([{ id: 'c', name: 'general' }]);
      }
      if (path.endsWith('/channels')) return json({ id: 'c', name: 'general' }, 201);
      if (path.endsWith('/roles')) return json({ id: 'r', name: 'moderator' }, 201);
      if (path.endsWith('/webhooks/1')) return empty();

      return json({ id: 'c', name: 'renamed', content: 'sent' });
    });
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

  it('loads dynamic guild, channel, and role choices', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([{ id: 'g', name: 'Guild' }]))
      .mockResolvedValueOnce(json([{ id: 'g', name: 'Guild' }]))
      .mockResolvedValueOnce(json([{ id: 'c', name: 'Channel' }]))
      .mockResolvedValueOnce(json([{ id: 'r', name: 'Role' }]));
    vi.stubGlobal('fetch', fetch);

    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });
    const client = await discord.client({ req: req() });
    const addRole = pieceActionDefinition(discord.addRoleToMember)!;
    const send = pieceActionDefinition(discord.sendMessage)!;

    await expect(
      addRole.options?.guildId?.({ input: {}, client, options: {}, req: req() }),
    ).resolves.toEqual([{ label: 'Guild', value: 'g' }]);
    await expect(
      send.options?.channelId?.({ input: {}, client, options: {}, req: req() }),
    ).resolves.toEqual([{ label: 'Channel', value: 'c' }]);
    await expect(
      addRole.options?.roleId?.({ input: { guildId: 'g' }, client, options: {}, req: req() }),
    ).resolves.toEqual([{ label: 'Role', value: 'r' }]);
  });

  it.each([
    ['messageCreated', { channelId: 'c', limit: 2 }, '/channels/c/messages?limit=2', 'timestamp'],
    ['memberJoined', { guildId: 'g', limit: 2 }, '/guilds/g/members?limit=2', 'joined_at'],
  ] as const)(
    'advances the %s polling cursor without replaying initial history',
    async (slug, input, path, field) => {
      const old = new Date(1_000).toISOString();
      const fresh = new Date(2_000).toISOString();
      const fetch = vi.fn().mockImplementation(async () =>
        json([
          { id: 'new', [field]: fresh },
          { id: 'old', [field]: old },
        ]),
      );
      vi.stubGlobal('fetch', fetch);

      const definition = pieceFactoryDefinition(createDiscord).triggers?.find(
        (trigger) => trigger.slug === slug,
      );

      if (!definition || definition.type !== 'polling') {
        throw new Error(`Missing polling trigger '${slug}'.`);
      }

      const client = await createDiscord({ auth: { botToken: 'discord_test_token' } }).client({
        req: req(),
      });
      const initial = await definition.run({ client, input, options: {}, req: req() } as never);
      const next = await definition.run({
        client,
        input,
        cursor: 1_500,
        options: {},
        req: req(),
      } as never);

      expect('options' in definition).toBe(false);
      expect(initial.events).toEqual([]);
      expect(initial.cursor).toBe(2_000);
      expect(next).toEqual({ events: [{ id: 'new', [field]: fresh }], cursor: 2_000 });
      expect(fetch).toHaveBeenCalledWith(`https://discord.com/api/v10${path}`, expect.any(Object));
    },
  );

  it('surfaces Discord API errors without exposing the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Missing Access' }, 403)));

    const discord = createDiscord({ auth: { botToken: 'discord_test_token' } });

    await expect(
      discord.removeMember({ input: { guildId: 'g', userId: 'u' }, req: req() }),
    ).rejects.toThrow('Discord request failed (403): Missing Access');
  });
});
