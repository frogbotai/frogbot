import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { pieceConformance } from '../../../../packages/frogbot/src/pieces/conformance.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { channelFixture } from '../channels/helpers.js';
import { conformanceChannelState } from './channelState.js';

const createValid = () =>
  definePiece({
    slug: 'example',
    label: 'Example',
    options: z.object({ region: z.string() }),
    actions: [
      {
        slug: 'getItem',
        description: 'Get an item',
        input: z.object({ id: z.string() }),
        output: z.object({ id: z.string(), region: z.string() }),
        options: {
          id: async ({ options }) => [{ label: options.region, value: 'item' }],
        },
        run: async ({ input, options }) => ({ id: input.id, region: options.region }),
      },
      {
        slug: 'fail',
        description: 'Fail',
        input: z.object({}),
        run: async () => {
          throw new Error('vendor unavailable');
        },
      },
    ],
    triggers: [
      {
        slug: 'itemCreated',
        type: 'app',
        event: 'item.created',
        description: 'Item created',
        input: z.object({}),
        run: async () => [],
      },
    ],
  });

const validFixtures = () => ({
  factoryOptions: { region: 'us' },
  actions: [
    { slug: 'getItem', input: { id: '1' }, expect: { result: { id: '1', region: 'us' } } },
    { slug: 'fail', input: {}, expect: { error: /vendor unavailable/ } },
  ],
  options: [
    {
      action: 'getItem',
      field: 'id',
      expect: [{ label: 'us', value: 'item' }],
    },
  ],
  triggers: [{ slug: 'itemCreated', type: 'app' as const }],
});

const channelReq = { frogbot: {} } as never;

const createChannel = ({ adapterOwned = false } = {}) =>
  definePiece({
    slug: 'channel',
    label: 'Channel',
    auth: z.object({ token: z.string() }),
    options: z.object({ secret: z.string() }),
    client: ({ auth }) => auth,
    channel: {
      adapter: () => {
        const { adapter } = channelFixture();
        const deliver = adapter.handleWebhook;

        return {
          ...adapter,
          handleWebhook: async (...args: Parameters<typeof deliver>) =>
            args[0].headers.get('x-secret') === 'secret'
              ? deliver(...args)
              : new Response(null, { status: 401 }),
        } as never;
      },
      identity: async ({ author }) =>
        author.userId === 'known' ? ({ id: 'user', collection: 'users' } as never) : null,
    },
    webhook: {
      verify: adapterOwned
        ? undefined
        : async ({ req, options }) => req.headers.get('x-secret') === options.secret,
      handshake: async ({ req }) =>
        typeof req.data === 'object' && req.data && 'challenge' in req.data
          ? new Response(String(req.data.challenge), { status: 202 })
          : null,
      parse: ({ req }) => ({
        event:
          typeof req.data === 'object' && req.data && 'event' in req.data
            ? String(req.data.event)
            : '',
      }),
    },
    actions: [],
  });

const channelFixtures = () => ({
  factoryOptions: { auth: { token: 'token' }, secret: 'secret' },
  actions: [],
  channel: {
    adapter: { name: 'slack' },
    identity: {
      author: { userId: 'known' } as never,
      req: channelReq,
      expect: { id: 'user', collection: 'users' },
    },
    webhook: {
      state: conformanceChannelState(),
      requests: [
        {
          request: {
            headers: { 'x-secret': 'secret' },
            body: JSON.stringify({ id: 'message', threadId: 'channel:thread', text: 'Hello' }),
            data: { challenge: 'ready', event: 'message.created' },
          },
          verified: true,
          event: 'message.created',
          handshake: { status: 202, body: 'ready' },
          delivery: {
            status: 202,
            messages: [
              { id: 'message', threadId: 'channel:thread', text: 'Hello', authorId: 'user-1' },
            ],
          },
        },
        {
          request: { headers: { 'x-secret': 'wrong' }, data: { event: 'message.created' } },
          verified: false,
          delivery: { status: 401, messages: [] },
        },
      ],
    },
  },
});

describe('pieceConformance', () => {
  it('accepts a conforming piece', async () => {
    await expect(pieceConformance(createValid(), validFixtures())).resolves.toBeUndefined();
  });

  it('requires exact, unique action coverage', async () => {
    const missing = validFixtures();
    missing.actions.pop();
    await expect(pieceConformance(createValid(), missing)).rejects.toThrow('must cover exactly');
    const duplicate = validFixtures();
    duplicate.actions.push(duplicate.actions[0]!);
    await expect(pieceConformance(createValid(), duplicate)).rejects.toThrow(
      "Action fixtures contains duplicate 'getItem'",
    );
  });

  it('rejects invalid factory options and action inputs', async () => {
    const options = validFixtures();
    options.factoryOptions = { region: 1 as never };
    await expect(pieceConformance(createValid(), options)).rejects.toThrow(
      'factory options are invalid',
    );
    const input = validFixtures();
    input.actions[0]!.input = { id: 1 };
    await expect(pieceConformance(createValid(), input)).rejects.toThrow('expected string');
  });

  it('rejects incorrect results and error expectations', async () => {
    const result = validFixtures();
    result.actions[0]!.expect = { result: { id: 'wrong', region: 'us' } };
    await expect(pieceConformance(createValid(), result)).rejects.toThrow('unexpected result');
    const error = validFixtures();
    error.actions[1]!.expect = { error: 'different error' };
    await expect(pieceConformance(createValid(), error)).rejects.toThrow(
      "threw 'vendor unavailable'",
    );
  });

  it('rejects invalid action outputs', async () => {
    const createInvalidOutput = definePiece({
      slug: 'output',
      label: 'Output',
      actions: [
        {
          slug: 'run',
          description: 'Run',
          input: z.object({}),
          output: z.string(),
          run: async () => 1 as never,
        },
      ],
    });
    await expect(
      pieceConformance(createInvalidOutput, {
        actions: [{ slug: 'run', input: {}, expect: { result: 1 } }],
      }),
    ).rejects.toThrow('expected string');
  });

  it('requires declared option callbacks and their exact choices', async () => {
    const missing = validFixtures();
    missing.options![0]!.field = 'missing';
    await expect(pieceConformance(createValid(), missing)).rejects.toThrow(
      "has no options callback for 'missing'",
    );
    const choices = validFixtures();
    choices.options![0]!.expect = [];
    await expect(pieceConformance(createValid(), choices)).rejects.toThrow('unexpected choices');
  });

  it('requires trigger declarations to match exactly', async () => {
    const fixtures = validFixtures();
    fixtures.triggers = [{ slug: 'itemCreated', type: 'polling' }];
    await expect(pieceConformance(createValid(), fixtures)).rejects.toThrow(
      'trigger fixtures must match declarations',
    );
  });

  it('checks OAuth by recipe declaration, not auth field shape', async () => {
    const createTokenShaped = definePiece({
      slug: 'token-shaped',
      label: 'Token shaped',
      auth: z.object({ accessToken: z.string() }),
      client: ({ auth }) => auth,
      actions: [],
    });
    await expect(
      pieceConformance(createTokenShaped, {
        factoryOptions: { auth: { accessToken: 'token' } },
        actions: [],
        oauth: true,
      }),
    ).rejects.toThrow('OAuth declaration expected true, received false');

    const createOAuth = definePiece({
      slug: 'oauth',
      label: 'OAuth',
      auth: z.object({ credential: z.string() }),
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        scopes: [],
      },
      actions: [],
    });
    await expect(
      pieceConformance(createOAuth, {
        factoryOptions: { auth: { credential: 'token' } },
        actions: [],
      }),
    ).rejects.toThrow('OAuth declaration expected false, received true');
  });

  it('executes actions rather than mocking run', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    const createPiece = definePiece({
      slug: 'execution',
      label: 'Execution',
      actions: [{ slug: 'run', description: 'Run', input: z.object({}), run }],
    });
    await pieceConformance(createPiece, {
      actions: [{ slug: 'run', input: {}, expect: { result: 'ok' } }],
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it('checks channel adapter, identity, and recorded webhook deliveries', async () => {
    await expect(pieceConformance(createChannel(), channelFixtures())).resolves.toBeUndefined();
  });

  it('accepts adapter-owned verification and observes initialized message dispatch', async () => {
    await expect(
      pieceConformance(createChannel({ adapterOwned: true }), channelFixtures()),
    ).resolves.toBeUndefined();
  });

  it.each(['id', 'threadId', 'text', 'authorId'] as const)(
    'rejects an unexpected delivered %s',
    async (field) => {
      const fixtures = channelFixtures();
      fixtures.channel.webhook.requests[0]!.delivery.messages[0]![field] = 'wrong';

      await expect(pieceConformance(createChannel(), fixtures)).rejects.toThrow(
        'channel webhook dispatched unexpected messages',
      );
    },
  );

  it('rejects an unexpected webhook status', async () => {
    const fixtures = channelFixtures();
    fixtures.channel.webhook.requests[0]!.delivery.status = 200;

    await expect(pieceConformance(createChannel(), fixtures)).rejects.toThrow(
      'channel webhook returned status 202, expected 200',
    );
  });

  it('rejects unexpected dispatch and disconnects state after a failure', async () => {
    const fixtures = channelFixtures();
    const disconnect = vi.spyOn(fixtures.channel.webhook.state, 'disconnect');
    fixtures.channel.webhook.requests[0]!.delivery.messages = [];

    await expect(pieceConformance(createChannel(), fixtures)).rejects.toThrow(
      'channel webhook dispatched unexpected messages',
    );

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('requires adapter-owned authentication expectations to match denial', async () => {
    const fixtures = channelFixtures();
    fixtures.channel.webhook.requests[1]!.verified = true;

    await expect(pieceConformance(createChannel({ adapterOwned: true }), fixtures)).rejects.toThrow(
      'channel adapter verification returned an unexpected result',
    );
  });

  it('requires explicit message expectations for webhook delivery', async () => {
    const fixtures = channelFixtures();
    fixtures.channel.webhook.requests[0]!.delivery.messages = undefined as never;

    await expect(pieceConformance(createChannel(), fixtures)).rejects.toThrow(
      'channel webhook delivery requires expected messages',
    );
  });

  it('reports missing channel declarations and behavior clearly', async () => {
    const createWithoutChannel = definePiece({
      slug: 'without-channel',
      label: 'Without channel',
      auth: z.object({ token: z.string() }),
      options: z.object({ secret: z.string() }),
      client: ({ auth }) => auth,
      actions: [],
    });

    await expect(pieceConformance(createWithoutChannel, channelFixtures())).rejects.toThrow(
      'channel fixtures require a channel declaration',
    );

    const adapter = channelFixtures();
    adapter.channel.adapter.name = 'other';

    await expect(pieceConformance(createChannel(), adapter)).rejects.toThrow(
      'channel adapter has an unexpected name',
    );

    const identity = channelFixtures();
    identity.channel.identity.expect = null as never;

    await expect(pieceConformance(createChannel(), identity)).rejects.toThrow(
      'channel identity returned an unexpected result',
    );

    const verification = channelFixtures();
    verification.channel.webhook.requests[0]!.verified = false;

    await expect(pieceConformance(createChannel(), verification)).rejects.toThrow(
      'channel webhook verification returned an unexpected result',
    );
  });
});
