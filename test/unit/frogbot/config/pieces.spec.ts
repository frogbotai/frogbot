import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import {
  definePiece,
  pieceActionTool,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { Piece, PieceInstance } from '../../../../packages/frogbot/src/pieces/types.js';

const db = {} as never;
const collections = [{ slug: 'users', auth: true, fields: [] }];
const ai = { providers: { openai: { apiKey: 'sk-test' } } };
const agent = {
  slug: 'support',
  model: 'openai/gpt-5.4-mini',
  instructions: 'Help the user',
};

const createExample = definePiece({
  slug: 'example',
  label: 'Example',
  actions: [
    {
      slug: 'run',
      description: 'Run',
      input: z.object({}),
      async run() {},
    },
  ],
});

const createEmpty = definePiece({
  slug: 'empty',
  label: 'Empty',
  actions: [],
});

const createChannel = definePiece({
  slug: 'channel',
  label: 'Channel',
  auth: z.object({ token: z.string() }),
  client: ({ auth }) => auth,
  actions: [
    {
      slug: 'post',
      description: 'Post',
      input: z.object({}),
      async run() {},
    },
  ],
  channel: {
    adapter: () => ({}) as never,
    async identity() {
      return null;
    },
  },
});

const createLinked = definePiece({
  slug: 'linked',
  label: 'Linked',
  auth: z.object({ apiKey: z.string().min(1) }),
  client: ({ auth }) => auth,
  actions: [],
});

const createTrigger = definePiece({
  slug: 'trigger-example',
  label: 'Trigger example',
  actions: [],
  webhook: {
    verify: async () => true,
    parse: () => ({ event: 'created' }),
  },
  triggers: [
    {
      slug: 'created',
      type: 'app',
      event: 'created',
      description: 'Created',
      input: z.object({}),
      async run() {
        return [];
      },
    },
  ],
});

function instances(config: Partial<FrogBotConfig>): PieceInstance[] {
  return sanitize({ secret: 'secret', db, collections, ai, ...config }).pieces.instances;
}

describe('piece instances', () => {
  it('lists the instance behind a selected agent action', () => {
    const example = createExample();

    expect(instances({ agents: [{ ...agent, tools: [example.run] }] })).toEqual([example]);
  });

  it('lists whole instances in agent tools, including one with no actions', () => {
    const example = createExample();
    const empty = createEmpty();

    expect(instances({ agents: [{ ...agent, tools: [example, empty] }] })).toEqual([
      example,
      empty,
    ]);
  });

  it('lists the instance behind a root tool an agent inherits', () => {
    const example = createExample();

    expect(instances({ tools: [pieceActionTool(example.run)!], agents: [agent] })).toEqual([
      example,
    ]);
  });

  it('lists the instance behind a root tool when no agent inherits it', () => {
    const example = createExample();

    expect(
      instances({
        tools: [pieceActionTool(example.run)!],
        agents: [{ ...agent, inheritTools: false }],
      }),
    ).toEqual([example]);
  });

  it('lists trigger, channel and connection instances', () => {
    const trigger = createTrigger({});
    const channel = createChannel({ auth: { token: 'secret' } });
    const linked = createLinked();

    const result = instances({
      agents: [
        {
          ...agent,
          triggers: [{ trigger: trigger.triggers.created, handler: async () => {} }],
          channels: [channel],
        },
      ],
      connections: [{ piece: linked, secret: true }],
    } as never);

    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining([trigger, channel, linked]));
  });

  it('lists an instance once and puts channel instances ahead of tool-only ones', () => {
    const toolOnly = createChannel({ slug: 'tool-only', auth: { token: 'tool' } });
    const channel = createChannel({ auth: { token: 'secret' } });

    const result = instances({
      agents: [
        { ...agent, slug: 'writer', tools: [toolOnly.post] },
        { ...agent, channels: [channel], tools: [channel] },
      ],
      connections: [{ piece: channel, secret: true }],
    } as never);

    expect(result).toEqual([channel, toolOnly]);
  });

  it('ignores a leftover root pieces key in an untyped config', async () => {
    const example = createExample();
    const leftover = createExample({ slug: 'leftover' });

    const result = sanitize({
      secret: 'secret',
      db,
      collections,
      ai,
      agents: [{ ...agent, tools: [example] }],
      pieces: [leftover],
    } as never);

    expect(result.pieces.instances).toEqual([example]);
    await expect(result._internal.payloadConfig).resolves.toBeDefined();
  });

  it('exposes only native instances at the type boundary', () => {
    expectTypeOf<Piece>().toEqualTypeOf<PieceInstance>();
  });
});
