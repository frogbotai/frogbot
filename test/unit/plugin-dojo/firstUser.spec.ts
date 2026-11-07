import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import type { CollectionConfig } from '../../../packages/frogbot/src/collections/config/types.js';
import type { FrogBotConfig } from '../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../packages/frogbot/src/frogbot.js';

const { dojo } = await import('../../../packages/plugins/plugin-dojo/src/index.js');

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
  DOJO_FIRST_USER_EMAIL: ' Sam@Example.com ',
};

const Users: CollectionConfig = { slug: 'users', auth: true, fields: [] };

const template = (collections: CollectionConfig[] = [Users]): FrogBotConfig => ({
  secret: 'test-secret',
  db: {} as FrogBotConfig['db'],
  collections,
});

async function boot(
  config: FrogBotConfig,
  { existing = 0, fail }: { existing?: number; fail?: Error } = {},
) {
  const create = vi.fn(() => (fail ? Promise.reject(fail) : Promise.resolve({ id: 1 })));

  const find = vi.fn(() =>
    Promise.resolve({ docs: Array.from({ length: existing }, (_, id) => ({ id })) }),
  );

  const warn = vi.fn();
  const frogbot = { db: { find }, create, logger: { warn, info: vi.fn() } } as unknown as FrogBot;

  for (const onInit of [config.onInit ?? []].flat()) await onInit(frogbot);

  return {
    created: create.mock.calls.map(([args]) => args as Record<string, unknown>),
    found: find.mock.calls.map(([args]) => args as Record<string, unknown>),
    warnings: warn.mock.calls.map(([message]) => message as string),
  };
}

beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dojo() makes the sharer an empty app's first user", () => {
  it('creates one user with the sharer’s email and a random password, past access', async () => {
    const { created, found } = await boot(dojo()(template()) as FrogBotConfig);

    expect(found).toEqual([{ collection: 'users', limit: 1, pagination: false }]);
    expect(created).toEqual([
      {
        collection: 'users',
        data: { email: 'sam@example.com', password: expect.stringMatching(/^[\w-]{43}$/) },
        disableVerificationEmail: true,
        overrideAccess: true,
        depth: 0,
      },
    ]);
  });

  it('marks the user verified where the collection verifies', async () => {
    const Verified: CollectionConfig = { slug: 'users', auth: { verify: true }, fields: [] };
    const { created } = await boot(dojo()(template([Verified])) as FrogBotConfig);

    expect(created[0]?.data).toMatchObject({ email: 'sam@example.com', _verified: true });
  });

  it('adds nobody when the collection already has a user', async () => {
    const { created } = await boot(dojo()(template()) as FrogBotConfig, { existing: 1 });

    expect(created).toEqual([]);
  });

  it("runs after the app's own onInit", async () => {
    const order: string[] = [];
    const config = dojo()({
      ...template(),
      onInit: () => {
        order.push('app');
      },
    }) as FrogBotConfig;

    const onInits = [config.onInit ?? []].flat();

    expect(onInits).toHaveLength(2);

    await onInits[0]({} as FrogBot);

    expect(order).toEqual(['app']);
  });

  it('seeds nobody with signIn: false, without the variable, off Dojo, or when sign-in is off', async () => {
    expect((await boot(dojo({ signIn: false })(template()) as FrogBotConfig)).created).toEqual([]);

    vi.stubEnv('DOJO_FIRST_USER_EMAIL', '');

    expect((await boot(dojo()(template()) as FrogBotConfig)).created).toEqual([]);

    vi.stubEnv('DOJO_FIRST_USER_EMAIL', ENV.DOJO_FIRST_USER_EMAIL);

    vi.stubEnv('DOJO_URL', '');

    expect((await boot(dojo()(template()) as FrogBotConfig)).created).toEqual([]);

    vi.stubEnv('DOJO_URL', ENV.DOJO_URL);

    vi.stubEnv('DOJO', '');

    expect((await boot(dojo()(template()) as FrogBotConfig)).created).toEqual([]);
  });

  it('logs a warning naming the failing field and lets the app start', async () => {
    const fail = Object.assign(new Error('The following field is invalid: name'), {
      data: { errors: [{ path: 'name', message: 'This field is required.' }] },
    });

    const { warnings } = await boot(dojo()(template()) as FrogBotConfig, { fail });

    expect(warnings).toEqual([
      "[plugin-dojo] Couldn't add sam@example.com as the first user: name: This field is required.",
    ]);
  });
});
