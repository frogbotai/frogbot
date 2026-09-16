import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDiscordAdapter } from '../../../packages/pieces/piece-discord/node_modules/@chat-adapter/discord/dist/index.js';
import { channelFixture } from '../frogbot/channels/helpers.js';

const pieceRequire = createRequire(
  new URL('../../../packages/pieces/piece-discord/package.json', import.meta.url),
);
const adapterRequire = createRequire(
  pieceRequire.resolve('./node_modules/@chat-adapter/discord/dist/index.js'),
);
const { Client } = adapterRequire('discord.js') as {
  Client: {
    prototype: {
      login(token?: string): Promise<string>;
    };
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Installed Discord Gateway reaction identity constraints', () => {
  it('forwards indistinguishable same-millisecond additions and changes the timestamp on Gateway replay', async () => {
    const reaction = {
      channel_id: 'channel-1',
      guild_id: 'guild-1',
      message_id: 'message-1',
      user_id: 'user-1',
      emoji: { id: null, name: '🐸' },
      burst: false,
      type: 0,
    };
    const receivedAt = 1_789_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(receivedAt);
    const forwarded: Array<{ body: string; headers: Headers }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe('https://frogbot.example/api/webhooks/discord');

        forwarded.push({ body: String(init.body), headers: new Headers(init.headers) });

        return new Response(null, { status: 200 });
      }),
    );

    vi.spyOn(Client.prototype, 'login').mockImplementation(async function (this: {
      emit(event: string, packet: unknown): void;
    }) {
      this.emit('raw', { op: 0, s: 101, t: 'MESSAGE_REACTION_ADD', d: reaction });
      this.emit('raw', { op: 0, s: 102, t: 'MESSAGE_REACTION_REMOVE', d: reaction });
      this.emit('raw', { op: 0, s: 103, t: 'MESSAGE_REACTION_ADD', d: reaction });

      now.mockReturnValue(receivedAt + 10);
      this.emit('raw', { op: 0, s: 103, t: 'MESSAGE_REACTION_ADD', d: reaction });

      return 'bot-token';
    });

    const adapter = createDiscordAdapter({
      botToken: 'bot-token',
      applicationId: 'application-1',
      publicKey: 'ab'.repeat(32),
    });
    const fixture = channelFixture({ slug: 'discord', adapter });
    const controller = new AbortController();
    const pending: Promise<unknown>[] = [];

    await fixture.host.initialize(false);

    try {
      await adapter.startGatewayListener(
        { waitUntil: (task) => pending.push(task) },
        60_000,
        controller.signal,
        'https://frogbot.example/api/webhooks/discord',
      );

      await vi.waitFor(() => expect(forwarded).toHaveLength(4));

      expect(JSON.parse(forwarded[0]!.body)).toEqual({
        type: 'GATEWAY_MESSAGE_REACTION_ADD',
        timestamp: receivedAt,
        data: reaction,
      });
      expect(JSON.parse(forwarded[1]!.body)).toEqual({
        type: 'GATEWAY_MESSAGE_REACTION_REMOVE',
        timestamp: receivedAt,
        data: reaction,
      });
      expect(forwarded[2]!.body).toBe(forwarded[0]!.body);
      expect(JSON.parse(forwarded[3]!.body)).toEqual({
        type: 'GATEWAY_MESSAGE_REACTION_ADD',
        timestamp: receivedAt + 10,
        data: reaction,
      });
      expect(forwarded.map(({ headers }) => headers.get('x-discord-gateway-token'))).toEqual([
        'bot-token',
        'bot-token',
        'bot-token',
        'bot-token',
      ]);
    } finally {
      controller.abort();

      await Promise.all(pending);
      await fixture.host.shutdown();
    }
  });
});
