import type { Adapter } from 'chat';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { buildIngressRegistry } from '../../../../packages/frogbot/src/triggers/registry.js';

const channelPiece = definePiece({
  slug: 'channel-test',
  label: 'Channel test',
  auth: z.object({ token: z.string() }),
  actions: [],
  client: ({ auth }) => auth,
  channel: {
    adapter: () => ({ name: 'channel-test' }) as Adapter,
    identity: async () => null,
  },
});

describe('channel ingress registry', () => {
  it('registers an instance that has no app triggers', () => {
    const instance = channelPiece({ auth: { token: 'secret' } });
    const registry = buildIngressRegistry({
      agents: [
        {
          slug: 'support',
          instructions: 'Help',
          channels: [instance],
        },
      ],
    });

    expect(registry['channel-test']).toEqual({
      instance,
      subscribers: [],
      channelAgentSlug: 'support',
    });
  });

  it('rejects different instances sharing one ingress slug', () => {
    const first = channelPiece({ auth: { token: 'first' } });
    const second = channelPiece({ auth: { token: 'second' } });

    expect(() =>
      buildIngressRegistry({
        agents: [
          { slug: 'first', instructions: 'First', channels: [first] },
          { slug: 'second', instructions: 'Second', channels: [second] },
        ],
      }),
    ).toThrow("Ingress slug 'channel-test' is shared by agents 'first' and 'second'.");
  });
});
