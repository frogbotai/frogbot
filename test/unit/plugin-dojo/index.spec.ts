import type * as S3Module from '@frogbotai/storage-s3';
import type * as PayloadModule from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveModel } from '../../../packages/frogbot/src/ai/resolve.js';
import type { ModelId } from '../../../packages/frogbot/src/ai/types.js';
import type { CollectionConfig } from '../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotConfig } from '../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../packages/frogbot/src/frogbot.js';
import type { Plugin } from '../../../packages/frogbot/src/plugin.js';
import { gcsStorage } from '../../../packages/storage-gcs/src/index.js';

const s3Options = vi.hoisted(() => [] as unknown[]);

vi.mock('@frogbotai/storage-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof S3Module>();

  return {
    s3Storage: (options: Parameters<typeof actual.s3Storage>[0]) => {
      s3Options.push(options);

      return actual.s3Storage(options);
    },
  };
});

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn(async (config: PayloadModule.Config) => {
    let built = config;

    for (const adapter of config.storage ?? []) built = await adapter.init(built);

    return { globals: [], ...built };
  }),
  handleEndpoints: vi.fn(),
}));

vi.mock('../../../packages/frogbot/src/getFrogBot.js', () => ({
  getCachedFrogBot: vi.fn(() => null),
  seedFrogBotCache: vi.fn(),
}));

const { buildConfig } = await import('../../../packages/frogbot/src/config/build.js');
const { createAIGateway } = await import('../../../packages/frogbot/src/ai/init.js');
const { dojo } = await import('../../../packages/plugins/plugin-dojo/src/index.js');

const ENV = {
  DOJO_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  DOJO_R2_BUCKET: 'app-bucket',
  DOJO_R2_ACCESS_KEY_ID: 'r2-key',
  DOJO_R2_SECRET_ACCESS_KEY: 'r2-secret',
  DOJO_AI_API_KEY: 'fb_router-key',
  DOJO_AI_BASE_URL: 'https://dojo.example/api/v1',
  DOJO_JOBS_SECRET: 'jobs-secret',
};

const Users: CollectionConfig = { slug: 'users', auth: true, fields: [] };

const Files: CollectionConfig = { slug: 'files', file: true, fields: [] };

const Media: CollectionConfig = { slug: 'media', upload: true, fields: [] };

const Chats: CollectionConfig = { slug: 'chats', chat: true, fields: [] };

const template = (overrides: Partial<FrogBotConfig> = {}): FrogBotConfig => ({
  secret: 'test-secret',
  db: {} as FrogBotConfig['db'],
  collections: [Users, Files],
  ai: { defaultModel: 'openai/gpt-5.4-mini', providers: { openai: true } },
  ...overrides,
});

const apply = (config: FrogBotConfig) => dojo()(config) as FrogBotConfig;

function prefixDefault(payloadConfig: unknown, slug: string): unknown {
  const { collections } = payloadConfig as {
    collections: { slug: string; fields: { name?: string; defaultValue?: unknown }[] }[];
  };

  return collections
    .find((collection) => collection.slug === slug)
    ?.fields.find((field) => field.name === 'prefix')?.defaultValue;
}

beforeEach(() => {
  s3Options.length = 0;
  vi.stubEnv('OPENAI_API_KEY', undefined);
  vi.stubEnv('ANTHROPIC_API_KEY', undefined);
  vi.stubEnv('DOJO', '1');

  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const badgeDependency = {
  '@frogbotai/plugin-dojo/client#DojoBadge': {
    path: '@frogbotai/plugin-dojo/client#DojoBadge',
    type: 'component',
  },
};

const dojoCommands = {
  share: expect.any(Function),
  pull: expect.any(Function),
  logs: expect.any(Function),
  logout: expect.any(Function),
};

describe('dojo() outside Dojo', () => {
  it('only lists the badge and adds its commands when DOJO is unset', () => {
    vi.stubEnv('DOJO', undefined);

    const config = template({ collections: [Users, Files, Media] });

    expect(apply(config)).toEqual({
      ...template({ collections: [Users, Files, Media] }),
      admin: { dependencies: badgeDependency },
      cli: { commands: dojoCommands },
    });
  });

  it('only lists the badge and adds its commands when DOJO is not 1', () => {
    vi.stubEnv('DOJO', 'true');

    expect(apply(template())).toEqual({
      ...template(),
      admin: { dependencies: badgeDependency },
      cli: { commands: dojoCommands },
    });
  });

  it.each(Object.keys(ENV))('names %s when it is missing on Dojo', (name) => {
    vi.stubEnv(name, undefined);

    expect(() => apply(template())).toThrow(`[plugin-dojo] DOJO=1 but ${name} is not set.`);
  });
});

describe('dojo() commands', () => {
  it.each([undefined, '1'])('adds share, pull, logs and logout with DOJO=%s', (value) => {
    vi.stubEnv('DOJO', value);

    expect(apply(template()).cli?.commands).toEqual(dojoCommands);
  });

  it('keeps a command the app already has', () => {
    const hello = vi.fn();

    expect(apply(template({ cli: { commands: { hello } } })).cli?.commands).toEqual({
      hello,
      ...dojoCommands,
    });
  });
});

describe('dojo() storage', () => {
  it('stores every upload collection under its slug in R2', async () => {
    const addMedia: Plugin = (config) => ({
      ...config,
      collections: [...config.collections, Media],
    });

    const sanitized = await buildConfig(
      template({ collections: [Users, Files, Chats], plugins: [addMedia, dojo()] }),
    );

    const payloadConfig = await sanitized._internal.payloadConfig;

    expect(prefixDefault(payloadConfig, 'files')).toBe('files');
    expect(prefixDefault(payloadConfig, 'media')).toBe('media');
    expect(prefixDefault(payloadConfig, 'frogbot-chat-assets')).toBe('frogbot-chat-assets');
  });

  it('runs after plugins with a higher order wherever it is listed', async () => {
    const { definePlugin } = await import('../../../packages/frogbot/src/definePlugin.js');
    const providersSeen: string[][] = [];

    const addMedia = definePlugin({
      slug: 'add-media',
      order: 100,
      plugin: ({ config }) => {
        providersSeen.push(Object.keys(config.ai?.providers ?? {}));

        return { ...config, collections: [...config.collections, Media] };
      },
    });

    const sanitized = await buildConfig(template({ plugins: [dojo(), addMedia()] }));

    expect(providersSeen).toEqual([['openai']]);
    expect(prefixDefault(await sanitized._internal.payloadConfig, 'media')).toBe('media');
  });

  it('points the S3 adapter at R2 with path-style URLs and no ACL', () => {
    apply(template({ collections: [Users, Files, Media] }));

    expect(s3Options).toEqual([
      {
        bucket: 'app-bucket',
        config: {
          endpoint: 'https://account.r2.cloudflarestorage.com',
          region: 'auto',
          forcePathStyle: true,
          credentials: { accessKeyId: 'r2-key', secretAccessKey: 'r2-secret' },
        },
        collections: {
          files: { prefix: 'files' },
          media: { prefix: 'media' },
          'frogbot-chat-assets': { prefix: 'frogbot-chat-assets' },
        },
      },
    ]);
  });

  it('keeps storage the app set', () => {
    const storage = [gcsStorage({ bucket: 'own', options: {} })];

    expect(apply(template({ storage })).storage).toBe(storage);
    expect(s3Options).toEqual([]);
  });
});

describe('dojo() AI', () => {
  it('leaves an app without AI alone', () => {
    expect(apply(template({ ai: undefined })).ai).toBeUndefined();
  });

  it.each([
    ['an apiKey', { openai: { apiKey: 'sk-own' } }, {}],
    ['true with the env key set', { openai: true }, { OPENAI_API_KEY: 'sk-env' }],
    [
      'a models list with the env key set',
      { openai: { models: ['gpt-5.4-mini'] } },
      { OPENAI_API_KEY: 'sk-env' },
    ],
    ["Anthropic's authToken", { anthropic: { authToken: 'token' } }, {}],
    [
      'one keyed provider among keyless ones',
      { openai: true, anthropic: { apiKey: 'sk-ant' } },
      {},
    ],
  ] as const)('keeps AI unchanged with %s', (_, providers, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);

    const ai = { defaultModel: 'openai/gpt-5.4-mini', providers } as FrogBotConfig['ai'];

    expect(apply(template({ ai })).ai).toBe(ai);
  });

  it("routes the template's keyless OpenAI through Dojo's gateway", async () => {
    const { ai } = apply(template());
    const dojoProvider = ai?.providers.dojo as {
      type: string;
      baseUrl: string;
      apiKey: string;
      models: { id: string; mode: string }[];
    };

    expect(Object.keys(ai?.providers ?? {})).toEqual(['dojo']);
    expect(dojoProvider).toMatchObject({
      type: 'openai-compatible',
      baseUrl: 'https://dojo.example/api/v1',
      apiKey: 'fb_router-key',
    });

    expect(dojoProvider.models.every(({ id }) => id.startsWith('openai/'))).toBe(true);
    expect(dojoProvider.models).toContainEqual(
      expect.objectContaining({ id: 'openai/gpt-5.4-mini', mode: 'chat' }),
    );

    expect(dojoProvider.models).toContainEqual(
      expect.objectContaining({ id: 'openai/text-embedding-3-small', mode: 'embedding' }),
    );

    expect(ai?.routers?.['openai/gpt-5.4-mini']).toEqual({ model: 'dojo/openai/gpt-5.4-mini' });
    expect(ai?.defaultModel).toBe('dojo/openai/gpt-5.4-mini');

    const sanitized = await buildConfig(template({ plugins: [dojo()] }));

    expect(sanitized.ai?.defaultModel).toBe('dojo/openai/gpt-5.4-mini');
    expect(resolveModel('openai/gpt-5.4-mini', sanitized.ai!)).toBe('dojo/openai/gpt-5.4-mini');
  });

  it("keeps a provider's own models list and the app's routers", () => {
    const { ai } = apply(
      template({
        ai: {
          defaultModel: 'fast' as ModelId,
          smallModel: 'openai/gpt-5.4-nano',
          providers: { openai: { apiKey: undefined, models: ['gpt-5.4-mini', 'gpt-5.4-nano'] } },
          routers: { fast: { model: 'openai/gpt-5.4-mini' } },
        },
      }),
    );

    const models = (ai?.providers.dojo as { models: { id: string }[] }).models;

    expect(models.map(({ id }) => id).sort()).toEqual([
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4-nano',
    ]);
    expect(ai?.routers?.fast).toEqual({ model: 'dojo/openai/gpt-5.4-mini' });
    expect(ai?.defaultModel).toBe('fast');
    expect(ai?.smallModel).toBe('dojo/openai/gpt-5.4-nano');
  });

  it('drops a transcription model on a routed provider and warns once at start', async () => {
    const warn = vi.fn();
    const sanitized = await buildConfig(
      template({
        ai: {
          defaultModel: 'openai/gpt-5.4-mini',
          transcriptionModel: 'openai/whisper-1',
          providers: { openai: true },
        },
        plugins: [dojo()],
      }),
    );

    expect(sanitized.ai?.transcriptionModel).toBeUndefined();

    await sanitized.onInit?.({ logger: { warn } } as unknown as FrogBot);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[plugin-dojo] Transcription isn't available through Dojo's router; bring a provider key to use it.",
    );

    const gateway = createAIGateway(sanitized.ai!);

    expect(() =>
      gateway.transcribeModel(resolveModel('openai/whisper-1', sanitized.ai!)),
    ).toThrowError(expect.objectContaining({ name: 'UnsupportedModalityError' }));
  });

  it('drops a speech model and its voice on a routed provider and warns once at start', async () => {
    const warn = vi.fn();
    const sanitized = await buildConfig(
      template({
        ai: {
          defaultModel: 'mistral/mistral-small-latest',
          speechModel: 'mistral/voxtral-mini-tts-latest',
          speechVoice: 'nova',
          providers: { mistral: true },
        },
        plugins: [dojo()],
      }),
    );

    expect(sanitized.ai?.speechModel).toBeUndefined();
    expect(sanitized.ai?.speechVoice).toBeUndefined();

    await sanitized.onInit?.({ logger: { warn } } as unknown as FrogBot);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[plugin-dojo] Speech isn't available through Dojo's router; bring a provider key to use it.",
    );
  });

  it('keeps a speech model and its voice that are not routed', () => {
    const { ai, onInit } = apply(
      template({
        ai: {
          defaultModel: 'mistral/mistral-small-latest',
          speechModel: 'custom/tts' as ModelId,
          speechVoice: 'nova',
          providers: { mistral: { apiKey: undefined, models: ['mistral-small-latest'] } },
        },
      }),
    );

    expect(ai?.speechModel).toBe('custom/tts');
    expect(ai?.speechVoice).toBe('nova');
    expect(onInit).toBeUndefined();
  });
});

describe('dojo() jobs', () => {
  const request = (authorization?: string, user?: { collection: string }) => ({
    req: {
      headers: new Headers(authorization ? { authorization } : {}),
      user,
      payload: { config: { admin: { user: 'users' } } },
    } as unknown as PayloadModule.PayloadRequest,
  });

  const run = async (config: FrogBotConfig, args: ReturnType<typeof request>) =>
    apply(config).jobs!.access!.run!(args);

  describe.each([
    ['without its own rule', undefined],
    [
      'with its own rule',
      ({ req }: { req: PayloadModule.PayloadRequest }) => req.user?.collection === 'users',
    ],
  ])('an app %s', (_, own) => {
    const config = template(own ? { jobs: { access: { run: own } } } : {});

    it('lets Dojo run with the jobs secret', async () => {
      await expect(run(config, request('Bearer jobs-secret'))).resolves.toBe(true);
    });

    it.each([
      ['a wrong token', 'Bearer wrong'],
      ['a Basic header', 'Basic jobs-secret'],
      ['no header', undefined],
    ])('refuses anonymous requests with %s', async (__, authorization) => {
      await expect(run(config, request(authorization))).resolves.toBe(false);
    });

    it("falls back to the app's rule for a signed-in user", async () => {
      await expect(run(config, request('Bearer wrong', { collection: 'users' }))).resolves.toBe(
        true,
      );
    });
  });

  it("keeps the app's rule when it refuses a signed-in user", async () => {
    const config = template({ jobs: { access: { run: () => false } } });

    await expect(run(config, request(undefined, { collection: 'users' }))).resolves.toBe(false);
    await expect(run(config, request('Bearer jobs-secret'))).resolves.toBe(true);
  });
});

describe('dojo() badge', () => {
  const badge = '@frogbotai/plugin-dojo/client#DojoBadge';

  const own = './components/Theme#Theme';

  const providers = (config: FrogBotConfig) => config.admin?.components?.providers;

  it("adds the badge after the app's own providers", () => {
    expect(providers(apply(template({ admin: { components: { providers: [own] } } })))).toEqual([
      own,
      badge,
    ]);
  });

  it('adds the badge to an app with no admin config', () => {
    expect(providers(apply(template()))).toEqual([badge]);
  });

  it('lists the badge for the import map, but adds no provider, without DOJO=1', () => {
    vi.stubEnv('DOJO', undefined);

    const applied = apply(template({ admin: { components: { providers: [own] } } }));

    expect(providers(applied)).toEqual([own]);
    expect((applied.admin as { dependencies?: unknown }).dependencies).toEqual(badgeDependency);
  });

  it('lists the badge for the import map too on Dojo', () => {
    expect((apply(template()).admin as { dependencies?: unknown }).dependencies).toEqual(
      badgeDependency,
    );
  });

  it("keeps the app's own import map dependencies", () => {
    vi.stubEnv('DOJO', undefined);

    const theirs = { './Widget#Widget': { path: './Widget#Widget', type: 'component' as const } };
    const admin = { dependencies: theirs } as FrogBotConfig['admin'];

    expect((apply(template({ admin })).admin as { dependencies?: unknown }).dependencies).toEqual({
      ...theirs,
      ...badgeDependency,
    });
  });

  it('adds the badge once when dojo() runs twice', () => {
    const twice = apply(apply(template()));

    expect(providers(twice)).toEqual([badge]);
    expect((twice.admin as { dependencies?: unknown }).dependencies).toEqual(badgeDependency);
  });
});

describe('dojo() as the platform plugin', () => {
  it('runs as the platform plugin, after the app plugins, from its default export', async () => {
    const { default: platformPlugin } =
      await import('../../../packages/plugins/plugin-dojo/src/index.js');

    const { registerPlatformPlugin } =
      await import('../../../packages/frogbot/src/config/platformPlugin.js');

    const addMedia: Plugin = (config) => ({
      ...config,
      collections: [...config.collections, Media],
    });

    registerPlatformPlugin(platformPlugin);
    const sanitized = await buildConfig(template({ plugins: [addMedia] }));

    expect(prefixDefault(await sanitized._internal.payloadConfig, 'media')).toBe('media');
  });
});
