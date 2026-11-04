import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../../../packages/frogbot/src/getFrogBot.js', () => ({
  createDefaultRequest: vi.fn(),
}));

import { oauthScopes } from '../../../../packages/frogbot/src/connections/oauth/scopes.js';
import {
  createPieceHelpers,
  definePiece,
  pieceActionTool,
  pieceInstanceTools,
  pieceToolInstance,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { generatePieceTypes } from '../../../../packages/frogbot/src/pieces/generateTypes.js';
import { pieceCapabilities } from '../../../../packages/frogbot/src/pieces/types.js';
import { sanitizeToolList } from '../../../../packages/frogbot/src/tools/config/sanitize.js';

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

  it('spreads an action into a tool that keeps execute and its connection', async () => {
    const createApproved = definePiece({
      slug: 'approved',
      label: 'Approved',
      auth: tokenAuth,
      client: ({ auth }) => ({ auth }),
      actions: [
        {
          slug: 'send',
          description: 'Send',
          input: z.object({ value: z.string() }),
          approval: 'ask',
          run({ input, client }) {
            return Promise.resolve({ input, client });
          },
        },
      ],
    });

    const piece = createApproved({ auth: { token: 'factory' } });
    const tool = { ...piece.send, approval: 'required' as const };
    const { req, resolvePieceCredential } = request();

    expect(pieceActionTool(piece.send)?.approval).toBe('ask');
    expect(tool).toMatchObject({
      slug: 'approved_send',
      description: 'Send',
      approval: 'required',
    });
    expect(pieceToolInstance(tool)).toBe(piece);
    await expect(
      tool.execute(
        { value: 'hi' },
        { req, frogbot: {} as never, agent: { slug: 'a', runId: 'r' }, overrideAccess: false },
      ),
    ).resolves.toEqual({ input: { value: 'hi' }, client: { auth: { token: 'resolved' } } });
    expect(resolvePieceCredential).toHaveBeenCalledWith({ piece, req });
  });

  it("gives an action's run the tool run's overrideAccess, and false on a direct call", async () => {
    const run = vi.fn(({ overrideAccess }: { overrideAccess: boolean }) =>
      Promise.resolve(overrideAccess),
    );

    const createTrusted = definePiece({
      slug: 'trusted',
      label: 'Trusted',
      actions: [{ slug: 'read', description: 'Read', input: z.object({}), run }],
    });

    const piece = createTrusted();
    const { req } = request();
    const ctx = (overrideAccess: boolean) => ({
      req,
      frogbot: {} as never,
      agent: { slug: 'a', runId: 'r' },
      overrideAccess,
    });

    await expect(piece.read.execute({}, ctx(true))).resolves.toBe(true);
    await expect(piece.read.execute({}, ctx(false))).resolves.toBe(false);
    await expect(piece.read({ input: {}, req })).resolves.toBe(false);
    await expect(piece.read({ input: {}, req, overrideAccess: true })).resolves.toBe(true);
  });

  it('labels each action tool with the piece and action names', () => {
    const exa = definePiece({
      slug: 'exa',
      label: 'Exa',
      actions: [
        {
          slug: 'search',
          label: 'Search',
          description: 'Search',
          input: z.object({}),
          async run() {},
        },
      ],
    })();

    const slack = definePiece({
      slug: 'slack',
      label: 'Slack',
      actions: [
        { slug: 'send_message', description: 'Send', input: z.object({}), async run() {} },
        { slug: 'addCardAttachment', description: 'Add', input: z.object({}), async run() {} },
        { slug: 'sendSMS', description: 'SMS', input: z.object({}), async run() {} },
        { slug: 'getHTTPResponse', description: 'Get', input: z.object({}), async run() {} },
        { slug: 'GET_URL', description: 'URL', input: z.object({}), async run() {} },
        { slug: 'list_v2_items', description: 'List', input: z.object({}), async run() {} },
        { slug: 'getID', description: 'ID', input: z.object({}), async run() {} },
      ],
    })();

    expect(pieceActionTool(exa.search)?.label).toBe('Exa: Search');
    expect(pieceInstanceTools(slack)?.map(({ label }) => label)).toEqual([
      'Slack: Send message',
      'Slack: Add card attachment',
      'Slack: Send SMS',
      'Slack: Get HTTP response',
      'Slack: GET URL',
      'Slack: List v2 items',
      'Slack: Get ID',
    ]);
    expect({ ...exa.search }.label).toBe('Exa: Search');
    expect(
      sanitizeToolList([{ ...exa.search, slug: 'exa_search_spread' }, exa.search], 'Agent').map(
        ({ label }) => label,
      ),
    ).toEqual(['Exa: Search', 'Exa: Search']);
    expect(
      sanitizeToolList([{ ...exa.search, approval: 'required' as const }], 'Agent')[0].label,
    ).toBe('Exa: Search');
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
        actions: [
          { slug: 'provider', description: 'Invalid', input: z.object({}), async run() {} },
        ],
      }),
    ).toThrow("action slug 'provider' is reserved");
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
        scopes: { catalog: {}, defaults: [] },
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

  it.each([0, -1, 1.5, '900', Infinity])('refuses OAuth tokenLifetime %j', (tokenLifetime) => {
    expect(() =>
      definePiece({
        slug: 'lifetime',
        label: 'Lifetime',
        auth: accessTokenAuth,
        client: ({ auth }) => auth,
        oauth: {
          authorizationUrl: 'https://example.com/authorize',
          tokenUrl: 'https://example.com/token',
          scopes: { catalog: {}, defaults: [] },
          tokenLifetime: tokenLifetime as number,
        },
        actions: [],
      }),
    ).toThrow("Piece 'lifetime' OAuth tokenLifetime must be a positive integer.");
  });

  it('resolves factory scopes against the recipe catalog', () => {
    const recipe = (scopes: object) =>
      ({
        slug: 'scoped',
        label: 'Scoped',
        auth: accessTokenAuth,
        client: ({ auth }: { auth: unknown }) => auth,
        oauth: {
          authorizationUrl: 'https://example.com/a',
          tokenUrl: 'https://example.com/t',
          scopes,
        },
        actions: [],
      }) as never;

    const createScoped = definePiece({
      slug: 'scoped',
      label: 'Scoped',
      auth: accessTokenAuth,
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        scopes: {
          catalog: {
            id: 'https://id',
            read: 'https://read',
            write: 'https://write',
            labels: 'https://labels',
          },
          defaults: ['read', 'write'],
          required: ['id'],
        },
      },
      actions: [],
    });

    const oauth = { clientId: 'id', clientSecret: 'secret' };
    const defaultScopes = vi.fn(({ defaultScopes }: { defaultScopes: string[] }) => [
      ...defaultScopes,
      'labels',
    ]);

    expect(oauthScopes(createScoped({ oauth }))).toEqual([
      'https://id',
      'https://read',
      'https://write',
    ]);
    expect(oauthScopes(createScoped({ oauth, scopes: defaultScopes as never }))).toEqual([
      'https://id',
      'https://read',
      'https://write',
      'https://labels',
    ]);
    expect(defaultScopes).toHaveBeenCalledWith({ defaultScopes: ['read', 'write'] });
    expect(oauthScopes(createScoped({ oauth, scopes: ['write', 'id', 'write'] }))).toEqual([
      'https://id',
      'https://write',
    ]);
    expect(oauthScopes(createScoped())).toEqual(['https://id', 'https://read', 'https://write']);

    expect(() => definePiece(recipe({ catalog: { read: 'r' }, defaults: ['write'] }))).toThrow(
      "scope 'write' is not in its catalog",
    );
    expect(() =>
      definePiece(recipe({ catalog: { read: 'r' }, defaults: [], required: ['write'] })),
    ).toThrow("scope 'write' is not in its catalog");
    expect(() =>
      definePiece(recipe({ catalog: { read: 'r' }, defaults: ['read'], required: ['read'] })),
    ).toThrow("scope 'read' is both a default and required");
    expect(() => definePiece(recipe({ catalog: { read: '' }, defaults: [] }))).toThrow(
      'OAuth scopes require a catalog of non-empty strings',
    );
    expect(() => definePiece(recipe(['read']))).toThrow(
      'OAuth scopes require a catalog of non-empty strings',
    );
    expect(() => createScoped({ oauth, scopes: ['lables'] as never })).toThrow(
      "Piece 'scoped' scope 'lables' is not in its catalog",
    );
    expect(() =>
      createScoped({
        oauth,
        scopes: (({ defaultScopes }: { defaultScopes: string[] }) => [
          ...defaultScopes,
          'lables',
        ]) as never,
      }),
    ).toThrow("scope 'lables' is not in its catalog");
    expect(() => createScoped({ oauth, scopes: 'read' as never })).toThrow(
      'scopes must be an array or a function returning one',
    );
    expect(() => createScoped({ oauth: { ...oauth, scopes: ['read'] } as never })).toThrow(
      "OAuth app does not take scopes. Use the factory's scopes option",
    );
    expect(() =>
      createExample({ auth: { token: 'token' }, prefix: 'value', scopes: [] } as never),
    ).toThrow("Piece 'example' does not declare OAuth");
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
        scopes: { catalog: {}, defaults: [] },
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

describe('definePiece provider', () => {
  const keyAuth = z.object({ apiKey: z.string() });
  const provider = {
    name: 'openai' as const,
    credential: ({ auth }: { auth: unknown }) => keyAuth.parse(auth),
  };

  const createKeyed = definePiece({
    slug: 'keyed',
    label: 'Keyed',
    auth: keyAuth,
    client: ({ auth }) => auth,
    provider,
    actions: [],
  });

  it('exposes the provider as a capability', () => {
    expect(createKeyed()[pieceCapabilities].provider).toBe(provider);
  });

  it('refuses factory auth, so the app key lives only in ai.providers', () => {
    expect(() => (createKeyed as (config: object) => object)({ auth: { apiKey: 'sk-x' } })).toThrow(
      "Piece 'keyed' takes no auth. Set the app key in ai.providers.openai.",
    );
  });

  it('requires an auth schema and a credential function', () => {
    expect(() =>
      definePiece({ slug: 'no-auth', label: 'No auth', provider, actions: [] } as never),
    ).toThrow("Piece 'no-auth' declares a provider but no auth schema.");
    expect(() =>
      definePiece({
        slug: 'no-credential',
        label: 'No credential',
        auth: keyAuth,
        client: ({ auth }) => auth,
        provider: { name: 'openai' } as never,
        actions: [],
      }),
    ).toThrow("Piece 'no-credential' provider requires a name, a credential function");
  });
});

describe('definePiece piece-run sign-in', () => {
  const signIn = {
    scopes: { catalog: { plan: 'plan.use' }, defaults: [], required: ['plan'] },
    authorize: () => Promise.resolve('https://provider.test/authorize'),
    refresh: ({ tokens }: { tokens: object }) =>
      Promise.resolve({ access_token: 'next', ...tokens }),
    label: 'Provider',
  };

  const createSignIn = definePiece({
    slug: 'signin',
    label: 'Sign in',
    auth: tokenAuth,
    client: ({ auth }) => auth,
    oauth: signIn,
    actions: [],
  });

  it('accepts a recipe with authorize and needs no OAuth app', () => {
    const piece = createSignIn();

    expect(piece[pieceCapabilities]).toMatchObject({
      oauth: signIn,
      factoryOAuth: false,
      pieceOAuth: true,
      signIn: false,
    });
    expect(oauthScopes(piece)).toEqual(['plan.use']);
  });

  it('refuses a factory OAuth app', () => {
    expect(() =>
      (createSignIn as (config: object) => object)({
        oauth: { clientId: 'id', clientSecret: 'secret' },
      }),
    ).toThrow("Piece 'signin' runs its own sign-in and takes no OAuth app.");
  });

  it.each<[string, object, string]>([
    [
      'redirect-flow fields',
      { tokenUrl: 'https://provider.test/token' },
      'OAuth authorize runs its own sign-in and takes no authorizationUrl, tokenUrl, pkce, params, account.',
    ],
    ['no refresh', { refresh: undefined }, 'OAuth authorize requires a refresh function.'],
    ['an empty label', { label: ' ' }, 'OAuth label must be a non-empty string.'],
    ['a revoke that is no function', { revoke: 'yes' }, 'OAuth revoke must be a function.'],
    ['an auth that is no schema', { auth: {} }, 'OAuth auth must be a schema.'],
  ])('refuses %s', (_kind, change, message) => {
    expect(() =>
      definePiece({
        slug: 'bad',
        label: 'Bad',
        auth: tokenAuth,
        client: ({ auth }) => auth,
        oauth: { ...signIn, ...change } as never,
        actions: [],
      }),
    ).toThrow(`Piece 'bad' ${message}`);
  });

  it('keeps redirect-flow pieces off pieceOAuth', () => {
    const createRedirect = definePiece({
      slug: 'redirect',
      label: 'Redirect',
      auth: accessTokenAuth,
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        scopes: { catalog: {}, defaults: [] },
      },
      actions: [],
    });

    expect(
      createRedirect({ oauth: { clientId: 'id', clientSecret: 'secret' } })[pieceCapabilities],
    ).toMatchObject({ factoryOAuth: true, pieceOAuth: false });
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
