import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { pieceConformance } from '../../../../packages/frogbot/src/pieces/conformance.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';

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
});
