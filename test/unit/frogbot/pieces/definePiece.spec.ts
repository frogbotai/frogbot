import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../../../packages/frogbot/src/getFrogBot.js', () => ({
  createDefaultRequest: vi.fn(),
}));

import {
  createPieceHelpers,
  definePiece,
  pieceActionTool,
  pieceInstanceTools,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { generatePieceTypes } from '../../../../packages/frogbot/src/pieces/generateTypes.js';
import { pieceCapabilities } from '../../../../packages/frogbot/src/pieces/types.js';

const tokenAuth = z.object({ token: z.string() });
const accessTokenAuth = z.object({ accessToken: z.string() });

function request(auth = { token: 'resolved' }) {
  const resolvePieceCredential = vi.fn().mockResolvedValue({ auth, key: auth });
  const req = {
    frogbot: { connections: { resolvePieceCredential } },
    user: { id: 'user' },
  } as never;

  return { req, resolvePieceCredential };
}

const createExample = definePiece({
  slug: 'example',
  label: 'Example',
  auth: tokenAuth,
  options: z.object({ prefix: z.string() }),
  client: ({ auth }) => ({ auth }),
  actions: [
    {
      slug: 'run',
      description: 'Run',
      input: z.object({ value: z.string() }),
      run({ input, client, options, req }) {
        return Promise.resolve({ input, client, options, req });
      },
    },
    {
      slug: 'other',
      description: 'Other',
      input: z.object({}),
      run() {
        return Promise.resolve('other');
      },
    },
  ],
});

describe('definePiece', () => {
  it('keeps capability metadata out of enumerable instance keys', () => {
    const piece = createExample({ auth: { token: 'factory' }, prefix: 'value' });

    expect(piece[pieceCapabilities]).toBeDefined();
    expect(Object.keys(piece)).not.toContain('~capabilities');
  });

  it('generates callback types without constructing a client or running actions', async () => {
    const client = vi.fn();
    const run = vi.fn();
    const piece = definePiece({
      slug: 'generated-example',
      label: 'Generated example',
      auth: tokenAuth,
      options: z.object({ region: z.string().default('us') }),
      client,
      actions: [
        {
          slug: 'send',
          description: 'Send',
          input: z.object({ count: z.number().default(1) }),
          output: z.object({ id: z.string() }),
          run,
        },
      ],
    });

    const types = await generatePieceTypes({ piece });

    expect(types).toContain('export interface GeneratedExampleTypes');
    expect(types).toContain('token: string');
    expect(types).toContain('region: string');
    expect(types).toContain('count: number');
    expect(types).toContain('id: string');
    expect(await generatePieceTypes({ piece })).toBe(types);
    expect(client).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    await expect(generatePieceTypes({ piece: {} })).rejects.toThrow('Expected a factory');
  });

  it('defines prototype-named actions as own methods', async () => {
    const createPrototype = definePiece({
      slug: 'prototype',
      label: 'Prototype',
      actions: [
        {
          slug: '__proto__',
          description: 'Run',
          input: z.object({}),
          run() {
            return Promise.resolve('ok');
          },
        },
      ],
    });

    const instance = createPrototype();

    expect(Object.getPrototypeOf(instance)).toBe(Object.prototype);
    expect(Object.hasOwn(instance, '__proto__')).toBe(true);
    await expect(instance.__proto__({ input: {}, req: request().req })).resolves.toBe('ok');
  });

  it('generates pre-parse result types and returns parsed action results', async () => {
    const piece = definePiece({
      slug: 'transformed',
      label: 'Transformed',
      actions: [
        {
          slug: 'read',
          description: 'Read',
          input: z.object({}),
          output: z.string().transform(Number).pipe(z.number()),
          run() {
            return Promise.resolve('42');
          },
        },
      ],
    });

    expect(await generatePieceTypes({ piece })).toContain('output: string');
    await expect(piece().read({ input: {}, req: request().req })).resolves.toBe(42);
  });

  it('preserves recursive schema references when embedding callback types', async () => {
    type Tree = { $id: string; children?: Tree[] };
    const tree: z.ZodType<Tree> = z
      .lazy(() =>
        z.object({
          $id: z.string(),
          children: z.array(tree).optional(),
        }),
      )
      .meta({ id: 'Tree' });

    const piece = definePiece({
      slug: 'recursive',
      label: 'Recursive',
      actions: [{ slug: 'read', description: 'Read', input: tree, async run() {} }],
    });

    const types = await generatePieceTypes({ piece });

    expect(types).toContain('$id: string');
    expect(types).toContain('children?: Input[]');
  });

  it('preserves tuple element requirements when embedding callback types', async () => {
    const piece = definePiece({
      slug: 'tuples',
      label: 'Tuples',
      actions: [
        {
          slug: 'read',
          description: 'Read',
          input: z.object({
            nonEmpty: z.tuple([z.string()], z.string()),
            pair: z.tuple([z.string(), z.number().optional()]),
          }),
          async run() {},
        },
      ],
    });

    const types = await generatePieceTypes({ piece });

    expect(types).toMatch(/nonEmpty: \[string, \.\.\.string\[\]\]/);
    expect(types).toMatch(/pair: \[string\] \| \[string, number\]/);
  });

  it('derives detached action methods and instance metadata', async () => {
    const example = createExample({ auth: { token: 'factory' }, prefix: 'value' });
    const { req, resolvePieceCredential } = request();
    const run = example.run;

    await expect(run({ input: { value: 'input' }, req })).resolves.toMatchObject({
      input: { value: 'input' },
      client: { auth: { token: 'resolved' } },
      options: { prefix: 'value' },
    });
    expect(example.slug).toBe('example');
    expect(resolvePieceCredential).toHaveBeenCalledWith({ piece: example, req });
    expect(example.piece).toBe('example');
    expect(pieceActionTool(example.run)?.slug).toBe('example_run');
    expect(pieceInstanceTools(example)?.map(({ slug }) => slug)).toEqual([
      'example_run',
      'example_other',
    ]);
  });

  it('isolates and reuses clients by runtime and credential', async () => {
    const client = vi.fn(({ auth }) => ({ auth }));
    const createCached = definePiece({
      slug: 'cached',
      label: 'Cached',
      auth: tokenAuth,
      client,
      actions: [],
    });

    const cached = createCached({ auth: { token: 'factory' } });
    const first = request({ token: 'one' });
    await cached.client({ req: first.req });
    await cached.client({ req: first.req });
    const second = request({ token: 'two' });
    await cached.client({ req: second.req });

    expect(client).toHaveBeenCalledTimes(2);
  });

  it('validates factory values and reserved action names', () => {
    expect(() => createExample({ auth: { token: 1 } as never, prefix: 'value' })).toThrow();
    expect(() =>
      definePiece({
        slug: 'invalid',
        label: 'Invalid',
        actions: [{ slug: 'client', description: 'Invalid', input: z.object({}), async run() {} }],
      }),
    ).toThrow("action slug 'client' is reserved");
    expect(() =>
      definePiece({
        slug: 'invalid',
        label: 'Invalid',
        actions: [
          { slug: 'not-valid', description: 'Invalid', input: z.object({}), async run() {} },
        ],
      }),
    ).toThrow("action slug 'not-valid' is not a valid method name");
    expect(() =>
      createExample({ slug: 'not safe', auth: { token: 'token' }, prefix: 'value' }),
    ).toThrow("instance slug 'not safe' is not URL-safe");
  });

  it('validates OAuth apps and trigger identities', () => {
    const oauth = definePiece({
      slug: 'oauth',
      label: 'OAuth',
      auth: accessTokenAuth,
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        scopes: [],
      },
      actions: [],
    });

    expect(() => oauth({ oauth: { clientId: '', clientSecret: 'secret' } })).toThrow(
      'OAuth app requires clientId and clientSecret',
    );
    expect(() =>
      definePiece({
        slug: 'trigger',
        label: 'Trigger',
        actions: [],
        triggers: [
          {
            slug: 'created',
            type: 'app',
            description: 'Created',
            input: z.object({}),
            run() {
              return Promise.resolve([]);
            },
          } as never,
        ],
      }),
    ).toThrow("app trigger 'created' requires an event");
    expect(() =>
      definePiece({
        slug: 'duplicate',
        label: 'Duplicate',
        actions: [],
        triggers: [
          {
            slug: 'same',
            type: 'polling',
            description: 'Same',
            input: z.object({}),
            run() {
              return Promise.resolve({ events: [] });
            },
          },
          {
            slug: 'same',
            type: 'polling',
            description: 'Same',
            input: z.object({}),
            run() {
              return Promise.resolve({ events: [] });
            },
          },
        ],
      }),
    ).toThrow("duplicate trigger 'same'");
  });

  it('attaches capability and factory OAuth metadata', () => {
    const createCapable = definePiece({
      slug: 'capable',
      label: 'Capable',
      auth: accessTokenAuth,
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        scopes: [],
        account() {
          return Promise.resolve({ id: 'id', label: 'Account', email: 'user@example.com' });
        },
      },
      actions: [],
      email: {
        send() {
          return Promise.resolve(null);
        },
      },
    });

    const capable = createCapable({ oauth: { clientId: 'id', clientSecret: 'secret' } });

    expect(capable[pieceCapabilities]).toMatchObject({
      email: expect.any(Object),
      factoryOAuth: true,
      signIn: true,
    });
  });

  it('allows auth pieces without factory auth', async () => {
    const example = createExample({ prefix: 'value' });
    const { req } = request();

    await expect(example.run({ input: { value: 'input' }, req })).resolves.toMatchObject({
      client: { auth: { token: 'resolved' } },
    });
  });

  it('allows zero-argument factories unless options are required', () => {
    const createPlain = definePiece({ slug: 'plain', label: 'Plain', actions: [] });

    expect(createPlain()).toMatchObject({ slug: 'plain', piece: 'plain' });

    const createRequired = definePiece({
      slug: 'required',
      label: 'Required',
      options: z.object({ region: z.string() }),
      actions: [],
    });

    expect(() => (createRequired as (config?: object) => object)()).toThrow();
    expect(createRequired({ region: 'us-east-1' })).toMatchObject({
      slug: 'required',
      piece: 'required',
    });
  });
});

describe('createPieceHelpers', () => {
  it('returns each definition unchanged', () => {
    const { defineAction, defineAppTrigger, definePollingTrigger, defineWebhookTrigger } =
      createPieceHelpers();

    const action = {
      slug: 'echo',
      description: 'Echo',
      input: z.object({ text: z.string() }),
      run({ input }: { input: { text: string } }) {
        return Promise.resolve(input.text);
      },
    };

    const appTrigger = {
      slug: 'received',
      description: 'Received',
      type: 'app' as const,
      event: 'received',
      input: z.object({}),
      run() {
        return Promise.resolve([]);
      },
    };

    const pollingTrigger = {
      slug: 'polled',
      description: 'Polled',
      type: 'polling' as const,
      input: z.object({}),
      run() {
        return Promise.resolve({ events: [] });
      },
    };

    const webhookTrigger = {
      slug: 'hooked',
      description: 'Hooked',
      type: 'webhook' as const,
      input: z.object({}),
      onEnable() {
        return Promise.resolve(null);
      },
      async onDisable() {},
      run() {
        return Promise.resolve([]);
      },
    };

    expect(defineAction(action)).toBe(action);
    expect(defineAppTrigger(appTrigger)).toBe(appTrigger);
    expect(definePollingTrigger(pollingTrigger)).toBe(pollingTrigger);
    expect(defineWebhookTrigger(webhookTrigger)).toBe(webhookTrigger);
  });
});
