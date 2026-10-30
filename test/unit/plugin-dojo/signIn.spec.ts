import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { validateSignIn } from '../../../packages/frogbot/src/auth/signIn/validate.js';
import type { CollectionConfig } from '../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotConfig } from '../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../packages/frogbot/src/frogbot.js';
import { pieceInstanceDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { SignInMethod } from '../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';

const { createGoogle } = await import('../../../packages/pieces/piece-google/src/index.js');
const { dojo } = await import('../../../packages/plugins/plugin-dojo/src/index.js');
const { createDojoSignIn } = await import('../../../packages/plugins/plugin-dojo/src/signIn.js');

const ENV = {
  DOJO: '1',
  DOJO_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  DOJO_R2_BUCKET: 'app-bucket',
  DOJO_R2_ACCESS_KEY_ID: 'r2-key',
  DOJO_R2_SECRET_ACCESS_KEY: 'r2-secret',
  DOJO_AI_API_KEY: 'fb_router-key',
  DOJO_AI_BASE_URL: 'https://dojo.example/api/v1',
  DOJO_JOBS_SECRET: 'jobs-secret',
  DOJO_OAUTH_CLIENT_ID: '42',
  DOJO_OAUTH_CLIENT_SECRET: 'oauth-secret',
  DOJO_URL: 'https://dojo.example',
};

const google = createGoogle({ oauth: { clientId: 'google-id', clientSecret: 'google-secret' } });

const template = (collections: CollectionConfig[], admin?: FrogBotConfig['admin']) =>
  ({
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections,
    ...(admin && { admin }),
  }) satisfies FrogBotConfig;

const apply = (config: FrogBotConfig, options?: { signIn?: boolean }) =>
  dojo(options)(config) as FrogBotConfig;

const collection = (config: FrogBotConfig, slug: string) =>
  config.collections.find((entry) => entry.slug === slug)!;

const methods = (config: FrogBotConfig, slug = 'users') => {
  const { auth } = collection(config, slug);

  return typeof auth === 'object' ? auth.signIn : undefined;
};

const slugs = (config: FrogBotConfig, slug = 'users') =>
  methods(config, slug)?.map((method) => method.slug);

async function warnings(config: FrogBotConfig) {
  const warn = vi.fn();

  for (const onInit of [config.onInit ?? []].flat()) {
    await onInit({ logger: { warn } } as unknown as FrogBot);
  }

  return warn.mock.calls.map(([message]) => message as string);
}

const off = (reason: string, slug = 'users') =>
  `[plugin-dojo] Sign in with Dojo is off for '${slug}': ${reason}.`;

beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('dojo() sign-in on Dojo', () => {
  it("adds Dojo after the app's own methods, in a form core accepts", async () => {
    const Users: CollectionConfig = { slug: 'users', auth: { signIn: [google] }, fields: [] };
    const applied = apply(template([Users]));

    expect(slugs(applied)).toEqual(['google', 'dojo']);
    expect(validateSignIn(collection(applied, 'users')).map(({ slug }) => slug)).toEqual([
      'google',
      'dojo',
    ]);
    expect(methods(applied)?.[1].oauth).toEqual({ clientId: '42', clientSecret: 'oauth-secret' });
    expect(await warnings(applied)).toEqual([]);
  });

  it('turns `auth: true` into a sign-in list and keeps the other auth settings', () => {
    const applied = apply(
      template([
        { slug: 'users', auth: true, fields: [] },
        { slug: 'notes', fields: [] },
      ]),
    );

    expect(slugs(applied)).toEqual(['dojo']);
    expect(collection(applied, 'notes')).toEqual({ slug: 'notes', fields: [] });

    const verified = apply(template([{ slug: 'users', auth: { verify: true }, fields: [] }]));

    expect(collection(verified, 'users').auth).toEqual({
      verify: true,
      signIn: [expect.objectContaining({ slug: 'dojo' })],
    });
  });

  it('adds Dojo once when dojo() runs twice', () => {
    const twice = apply(apply(template([{ slug: 'users', auth: true, fields: [] }])));

    expect(slugs(twice)).toEqual(['dojo']);
  });

  it('picks `admin.user` among several auth collections', () => {
    const applied = apply(
      template(
        [
          { slug: 'customers', auth: true, fields: [] },
          { slug: 'staff', auth: true, fields: [] },
        ],
        { user: 'staff' },
      ),
    );

    expect(slugs(applied, 'staff')).toEqual(['dojo']);
    expect(collection(applied, 'customers').auth).toBe(true);
  });

  it('adds nothing without DOJO=1', async () => {
    vi.stubEnv('DOJO', undefined);

    const applied = apply(template([{ slug: 'users', auth: true, fields: [] }]));

    expect(collection(applied, 'users').auth).toBe(true);
    expect(applied.onInit).toBeUndefined();
    expect(await warnings(applied)).toEqual([]);
  });

  it('adds no method and no warning with `signIn: false`', () => {
    const applied = apply(template([{ slug: 'users', auth: true, fields: [] }]), {
      signIn: false,
    });

    expect(collection(applied, 'users').auth).toBe(true);
    expect(applied.onInit).toBeUndefined();
  });

  it("keeps the app's own onInit before the warning", async () => {
    vi.stubEnv('DOJO_URL', undefined);

    const own = vi.fn();
    const applied = apply({
      ...template([{ slug: 'users', auth: true, fields: [] }]),
      onInit: own,
    });

    expect(await warnings(applied)).toEqual([off('DOJO_URL is not set')]);
    expect(own).toHaveBeenCalledTimes(1);
  });
});

describe('dojo() sign-in off', () => {
  const Users: CollectionConfig = { slug: 'users', auth: { signIn: [google] }, fields: [] };

  it.each(['DOJO_OAUTH_CLIENT_ID', 'DOJO_OAUTH_CLIENT_SECRET', 'DOJO_URL'])(
    'adds nothing and names %s when it is missing',
    async (name) => {
      vi.stubEnv(name, undefined);

      const applied = apply(template([Users]));

      expect(slugs(applied)).toEqual(['google']);
      expect(await warnings(applied)).toEqual([off(`${name} is not set`)]);
    },
  );

  it('adds nothing when DOJO_URL is not a URL', async () => {
    vi.stubEnv('DOJO_URL', 'dojo.example');

    const applied = apply(template([Users]));

    expect(slugs(applied)).toEqual(['google']);
    expect(await warnings(applied)).toEqual([off('DOJO_URL is not a URL')]);
  });

  it.each<[string, CollectionConfig[], FrogBotConfig['admin'], string]>([
    [
      'there is no auth collection',
      [{ slug: 'notes', fields: [] }],
      undefined,
      '[plugin-dojo] Sign in with Dojo is off: the app has no auth collection.',
    ],
    [
      'several auth collections and no `admin.user`',
      [
        { slug: 'customers', auth: true, fields: [] },
        { slug: 'staff', auth: true, fields: [] },
      ],
      undefined,
      '[plugin-dojo] Sign in with Dojo is off: the app has several auth collections and `admin.user` names none of them.',
    ],
    [
      '`admin.user` naming no auth collection',
      [
        { slug: 'customers', auth: true, fields: [] },
        { slug: 'staff', auth: true, fields: [] },
      ],
      { user: 'people' },
      '[plugin-dojo] Sign in with Dojo is off: the app has several auth collections and `admin.user` names none of them.',
    ],
    [
      '`disableLocalStrategy` without `enableFields`',
      [{ slug: 'users', auth: { disableLocalStrategy: true }, fields: [] }],
      undefined,
      off('`disableLocalStrategy` is set without `enableFields`'),
    ],
    [
      '`allowEmailLogin: false`',
      [{ slug: 'users', auth: { loginWithUsername: { allowEmailLogin: false } }, fields: [] }],
      undefined,
      off('`loginWithUsername.allowEmailLogin` is false'),
    ],
    [
      'a text `email` field',
      [{ slug: 'users', auth: true, fields: [{ name: 'email', type: 'text' }] }],
      undefined,
      off('its `email` field is not a unique, stored, non-localized email field'),
    ],
    [
      'an `email` field that is not unique',
      [{ slug: 'users', auth: true, fields: [{ name: 'email', type: 'email', unique: false }] }],
      undefined,
      off('its `email` field is not a unique, stored, non-localized email field'),
    ],
    [
      'a localized `email` field',
      [{ slug: 'users', auth: true, fields: [{ name: 'email', type: 'email', localized: true }] }],
      undefined,
      off('its `email` field is not a unique, stored, non-localized email field'),
    ],
    [
      '`signIn` that is not an array',
      [
        {
          slug: 'users',
          auth: { signIn: google as unknown as SignInMethod[] },
          fields: [],
        },
      ],
      undefined,
      off('`signIn` is not an array'),
    ],
    [
      "the app's own `dojo` method",
      [
        {
          slug: 'users',
          auth: {
            signIn: [createGoogle({ slug: 'dojo', oauth: { clientId: 'a', clientSecret: 'b' } })],
          },
          fields: [],
        },
      ],
      undefined,
      off("it already has a 'dojo' method"),
    ],
  ])('adds nothing and warns for %s', async (_, collections, admin, warning) => {
    const config = template(collections, admin);
    const applied = apply(config);

    expect(applied.collections).toEqual(config.collections);
    expect(await warnings(applied)).toEqual([warning]);
  });
});

describe('Sign in with Dojo method', () => {
  const method = createDojoSignIn({
    clientId: '42',
    clientSecret: 'oauth-secret',
    url: 'https://dojo.example',
  });

  const recipe = pieceInstanceDefinition(method).oauth!;

  const lookup = (body: unknown, status = 200) => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(body, { status })));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;

    return {
      fetch,
      signal,
      account: () =>
        recipe.account!({
          tokens: { access_token: 'dojo-token' },
          client: undefined,
          req: { signal } as unknown as FrogBotRequest,
        }),
    };
  };

  it("is labelled Dojo and uses Dojo's endpoints with PKCE and basic client auth", () => {
    expect(method.slug).toBe('dojo');
    expect(pieceInstanceDefinition(method).label).toBe('Dojo');
    expect(recipe).toMatchObject({
      authorizationUrl: 'https://dojo.example/api/oauth/authorize',
      tokenUrl: 'https://dojo.example/api/oauth/token',
      tokenEndpointAuthMethod: 'client_secret_basic',
      pkce: true,
      scopes: { required: ['profile', 'email'] },
    });
  });

  it('reads the person from userinfo with the access token', async () => {
    const { fetch, signal, account } = lookup({
      sub: '7',
      email: 'ada@example.com',
      email_verified: true,
      name: 'Ada',
    });

    await expect(account()).resolves.toEqual({ id: '7', label: 'Ada', email: 'ada@example.com' });
    expect(fetch).toHaveBeenCalledWith(new URL('https://dojo.example/api/oauth/userinfo'), {
      headers: { authorization: 'Bearer dojo-token' },
      signal,
    });
  });

  it.each([undefined, '', '  '])('labels the person by email when the name is %j', async (name) => {
    const { account } = lookup({ sub: '7', email: 'ada@example.com', email_verified: true, name });

    await expect(account()).resolves.toEqual({
      id: '7',
      label: 'ada@example.com',
      email: 'ada@example.com',
    });
  });

  it.each([
    ['an unverified email', { sub: '7', email: 'ada@example.com', email_verified: false }],
    ['no email', { sub: '7', email_verified: true }],
    ['no sub', { email: 'ada@example.com', email_verified: true }],
    ['null', null],
  ])('throws on %s', async (_, body) => {
    await expect(lookup(body).account()).rejects.toThrow(
      'Dojo did not return a verified email address.',
    );
  });

  it('throws when userinfo fails', async () => {
    await expect(lookup({ error: 'invalid_token' }, 500).account()).rejects.toThrow(
      'Dojo account lookup failed.',
    );
  });
});
