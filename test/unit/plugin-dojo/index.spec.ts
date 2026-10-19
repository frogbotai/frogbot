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

describe('dojo() outside Dojo', () => {
  it('returns the config unchanged when DOJO is unset', () => {
    vi.stubEnv('DOJO', undefined);

    const config = template({ collections: [Users, Files, Media] });

    expect(apply(config)).toEqual(template({ collections: [Users, Files, Media] }));
  });

  it('returns the config unchanged when DOJO is not 1', () => {
    vi.stubEnv('DOJO', 'true');

    const config = template();

    expect(apply(config)).toBe(config);
  });

  it.each(Object.keys(ENV))('names %s when it is missing on Dojo', (name) => {
    vi.stubEnv(name, undefined);

    expect(() => apply(template())).toThrow(`[plugin-dojo] DOJO=1 but ${name} is not set.`);
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
