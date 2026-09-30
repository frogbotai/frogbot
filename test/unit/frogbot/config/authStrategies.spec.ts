import { executeAuthStrategies, type Payload, type PayloadRequest } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachSessionPayload,
  unwrapSessionPayload,
  withAuthOperation,
} from '../../../../packages/frogbot/src/auth/operation.js';
import type { AuthStrategy } from '../../../../packages/frogbot/src/auth/types.js';
import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  buildConfig: vi.fn((config: Record<string, unknown>) =>
    Promise.resolve({ globals: [], ...config }),
  ),
}));

vi.mock('../../../../packages/frogbot/src/frogbot.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../packages/frogbot/src/frogbot.js')>()),
  initFrogBotFromPayload: vi.fn(),
}));

const { buildConfig } = await import('../../../../packages/frogbot/src/config/build.js');
const { FrogBot, initFrogBotFromPayload } =
  await import('../../../../packages/frogbot/src/frogbot.js');
const { getFrogBot, getCachedFrogBot, resetFrogBotCache } =
  await import('../../../../packages/frogbot/src/getFrogBot.js');
const { getFrogBotInstance, registerFrogBotInstance } =
  await import('../../../../packages/frogbot/src/instanceRegistry.js');

const init = vi.mocked(initFrogBotFromPayload);
const user = { id: 'user-1', collection: 'users', email: null };
const runtimeSymbol = Symbol.for('@frogbotai/request-runtime');

function makeConfig(strategies: AuthStrategy[]): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: { strategies }, fields: [] }],
  };
}

async function makePayload(config: FrogBotSanitizedConfig, slugs = ['users']): Promise<Payload> {
  const payloadConfig = await config._internal.payloadConfig;
  const collections = payloadConfig.collections.filter(({ slug }) => slugs.includes(slug));

  return {
    authStrategies: collections.flatMap(({ auth }) => auth.strategies ?? []),
    collections: Object.fromEntries(
      collections.map((collection) => [collection.slug, { config: collection }]),
    ),
    config: { loggingLevels: {} },
    db: {},
    logger: { error: vi.fn() },
  } as unknown as Payload;
}

function makeFrogBot(config: FrogBotSanitizedConfig) {
  const frogbot = {
    config,
    logger: { error: vi.fn() },
    kv: {
      get: vi.fn(async () => undefined),
      acquireLock: vi.fn(async (key: string) => ({ key, token: 'session-lock' })),
      extendLock: vi.fn(async () => true),
      releaseLock: vi.fn(async () => true),
    },
  };

  return frogbot as unknown as InstanceType<typeof FrogBot> & { logger: typeof frogbot.logger };
}

function run(payload: Payload) {
  return executeAuthStrategies({ payload, headers: new Headers() });
}

beforeEach(() => {
  resetFrogBotCache();
  init.mockReset();
});

afterEach(() => {
  resetFrogBotCache();
  vi.restoreAllMocks();
});

describe('custom authentication strategy adapters', () => {
  it('initializes a cold runtime once and reuses it on later calls', async () => {
    const authenticate = vi.fn<AuthStrategy['authenticate']>(() => ({ user }));
    const config = await buildConfig(makeConfig([{ name: 'token', authenticate }]));
    const payload = await makePayload(config);
    const frogbot = makeFrogBot(config);

    init.mockImplementationOnce(async (engine, currentConfig) => {
      registerFrogBotInstance(engine, frogbot, currentConfig);

      return frogbot;
    });

    const first = await run(payload);
    const second = await run(payload);

    expect(first.user).toBe(user);
    expect(second.user).toBe(user);
    expect(init).toHaveBeenCalledExactlyOnceWith(payload, config);
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(authenticate.mock.calls.map(([args]) => args.frogbot)).toEqual([frogbot, frogbot]);
    expect(getFrogBotInstance(payload)).toBe(frogbot);
    expect(getCachedFrogBot()).toBe(frogbot);
  });

  it('shares one initialization between concurrent cold requests', async () => {
    const authenticate = vi.fn<AuthStrategy['authenticate']>(() => ({ user }));
    const config = await buildConfig(makeConfig([{ name: 'token', authenticate }]));
    const payload = await makePayload(config);
    const frogbot = makeFrogBot(config);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });

    init.mockImplementationOnce(async (engine, currentConfig) => {
      await pending;
      registerFrogBotInstance(engine, frogbot, currentConfig);

      return frogbot;
    });

    const first = run(payload);
    const second = run(payload);

    await vi.waitFor(() => expect(init).toHaveBeenCalledOnce());
    expect(authenticate).not.toHaveBeenCalled();
    finish();

    const results = await Promise.all([first, second]);
    const later = await run(payload);

    expect(results.map((result) => result.user)).toEqual([user, user]);
    expect(later.user).toBe(user);
    expect(init).toHaveBeenCalledExactlyOnceWith(payload, config);
    expect(authenticate.mock.calls.map(([args]) => args.frogbot)).toEqual([
      frogbot,
      frogbot,
      frogbot,
    ]);
  });

  it('keeps the registered hot-reload config and seeds the cache with that config', async () => {
    const authenticate = vi.fn<AuthStrategy['authenticate']>(() => ({ user }));
    const configA = await buildConfig(makeConfig([{ name: 'token', authenticate }]));
    const configB = await buildConfig({ ...makeConfig([]), secret: 'reloaded-secret' });
    const payload = await makePayload(configA);
    const frogbot = makeFrogBot(configB);
    const refresh = vi.fn(async () => {});
    const freshInit = vi
      .spyOn(FrogBot.prototype, 'init')
      .mockRejectedValue(new Error('The cached runtime must be reused'));

    registerFrogBotInstance(payload, frogbot, configB, refresh);

    const result = await run(payload);
    const cached = await getFrogBot({ config: configB });

    expect(result.user).toBe(user);
    expect(authenticate.mock.calls[0]![0].frogbot).toBe(frogbot);
    expect(frogbot.config).toBe(configB);
    expect(cached).toBe(frogbot);
    expect(getCachedFrogBot()).toBe(frogbot);
    expect(refresh).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    expect(freshInit).not.toHaveBeenCalled();
  });

  it('forwards engine arguments without payload and attaches the request runtime', async () => {
    const authenticate = vi.fn<AuthStrategy['authenticate']>(() => ({ user }));
    const config = await buildConfig(makeConfig([{ name: 'token', authenticate }]));
    const payload = await makePayload(config);
    const frogbot = makeFrogBot(config);
    const headers = new Headers({ authorization: 'Bearer token' });
    const req = { payload, context: {}, headers } as PayloadRequest;

    registerFrogBotInstance(payload, frogbot, config);

    const result = await executeAuthStrategies({
      canSetHeaders: true,
      headers,
      isGraphQL: true,
      payload,
      req,
    });

    expect(result.user).toBe(user);
    expect(authenticate).toHaveBeenCalledExactlyOnceWith({
      canSetHeaders: true,
      frogbot,
      headers,
      isGraphQL: true,
      req,
      strategyName: 'token',
    });
    expect(authenticate.mock.calls[0]![0]).not.toHaveProperty('payload');
    expect(req).toHaveProperty('frogbot', frogbot);
    expect(Reflect.get(req, runtimeSymbol)).toBe(payload);
    expect(init).not.toHaveBeenCalled();
  });

  it('unwraps session payloads for lookup while keeping the request session-scoped', async () => {
    const authenticate = vi.fn<AuthStrategy['authenticate']>(() => ({ user }));
    const config = await buildConfig(makeConfig([{ name: 'token', authenticate }]));
    const payload = await makePayload(config);
    const frogbot = makeFrogBot(config);
    const headers = new Headers();
    const req = { payload, context: {}, headers, frogbot } as unknown as PayloadRequest &
      FrogBotRequest;

    registerFrogBotInstance(payload, frogbot, config);

    const result = await withAuthOperation({
      req,
      collectionSlug: 'users',
      operation: 'login',
      fn: async () => {
        attachSessionPayload(req);
        const scoped = req.payload;

        expect(scoped).not.toBe(payload);
        expect(unwrapSessionPayload(scoped)).toBe(payload);
        expect(getFrogBotInstance(scoped)).toBeUndefined();

        const authenticated = await executeAuthStrategies({ payload: scoped, headers, req });

        expect(req.payload).toBe(scoped);
        expect(req.frogbot).toBe(frogbot);
        expect(Reflect.get(req, runtimeSymbol)).toBe(payload);
        expect(authenticate.mock.calls[0]![0].req).toBe(req);

        return authenticated;
      },
    });

    expect(result.user).toBe(user);
    expect(authenticate.mock.calls[0]![0].frogbot).toBe(frogbot);
    expect(req.payload).toBe(payload);
    expect(init).not.toHaveBeenCalled();
    expect(getCachedFrogBot()).toBe(frogbot);
  });

  it('preserves earlier anonymous response headers when a later strategy throws', async () => {
    const error = new Error('sensitive session service failure');
    const config = await buildConfig(
      makeConfig([
        {
          name: 'headers',
          authenticate: () => ({
            user: null,
            responseHeaders: new Headers({ 'x-anonymous': 'retained' }),
          }),
        },
        {
          name: 'broken',
          authenticate: async () => {
            throw error;
          },
        },
      ]),
    );
    const payload = await makePayload(config);
    const frogbot = makeFrogBot(config);

    registerFrogBotInstance(payload, frogbot, config);

    const result = await run(payload);

    expect(result.user).toBeNull();
    expect(Array.from(result.responseHeaders!.entries())).toEqual([['x-anonymous', 'retained']]);
    expect(frogbot.logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: error },
      "[frogbot] auth strategy 'broken' on 'users' failed",
    );
  });

  it('continues after a null user and stops at the first authenticated user', async () => {
    const anonymous = vi.fn<AuthStrategy['authenticate']>(() => ({ user: null }));
    const authenticated = vi.fn<AuthStrategy['authenticate']>(() => ({ user }));
    const unused = vi.fn<AuthStrategy['authenticate']>(() => ({ user: null }));
    const config = await buildConfig(
      makeConfig([
        { name: 'anonymous', authenticate: anonymous },
        { name: 'token', authenticate: authenticated },
        { name: 'unused', authenticate: unused },
      ]),
    );
    const payload = await makePayload(config);
    const frogbot = makeFrogBot(config);

    registerFrogBotInstance(payload, frogbot, config);

    const result = await run(payload);

    expect(result.user).toBe(user);
    expect(anonymous).toHaveBeenCalledOnce();
    expect(authenticated).toHaveBeenCalledOnce();
    expect(unused).not.toHaveBeenCalled();
    expect(frogbot.logger.error).not.toHaveBeenCalled();
    expect(anonymous.mock.calls[0]![0]).toEqual({
      canSetHeaders: false,
      frogbot,
      headers: expect.any(Headers),
      isGraphQL: false,
      req: undefined,
      strategyName: 'anonymous',
    });
  });

  it('builds the same input twice without mutating or double-wrapping strategies', async () => {
    const error = new Error('strategy failure');
    const authenticate = vi.fn<AuthStrategy['authenticate']>(() => {
      throw error;
    });
    const strategy = Object.freeze({ name: 'shared', authenticate });
    const strategies = [strategy];
    const input = makeConfig(strategies);
    const auth = input.collections[0]!.auth;
    const first = await buildConfig(input);
    const second = await buildConfig(input);
    const firstPayload = await makePayload(first);
    const secondPayload = await makePayload(second);
    const firstFrogBot = makeFrogBot(first);
    const secondFrogBot = makeFrogBot(second);

    registerFrogBotInstance(firstPayload, firstFrogBot, first);
    registerFrogBotInstance(secondPayload, secondFrogBot, second);

    const results = await Promise.all([run(firstPayload), run(secondPayload)]);

    expect(results.map((result) => result.user)).toEqual([null, null]);
    expect(input).toEqual(makeConfig([strategy]));
    expect(input.collections[0]!.auth).toBe(auth);
    expect(strategies).toEqual([strategy]);
    expect(strategy.authenticate).toBe(authenticate);
    expect(firstPayload.authStrategies[0]!.authenticate).not.toBe(authenticate);
    expect(secondPayload.authStrategies[0]!.authenticate).not.toBe(authenticate);
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(firstFrogBot.logger.error).toHaveBeenCalledOnce();
    expect(secondFrogBot.logger.error).toHaveBeenCalledOnce();
  });

  it('logs each collection slug when collections share a strategy object', async () => {
    const error = new Error('shared strategy failure');
    const authenticate = vi.fn<AuthStrategy['authenticate']>(() => {
      throw error;
    });
    const strategy = { name: 'shared', authenticate };
    const config = await buildConfig({
      ...makeConfig([strategy]),
      collections: ['users', 'members'].map((slug) => ({
        slug,
        auth: { strategies: [strategy] },
        fields: [],
      })),
    });
    const payload = await makePayload(config, ['users', 'members']);
    const frogbot = makeFrogBot(config);

    registerFrogBotInstance(payload, frogbot, config);

    const result = await run(payload);

    expect(result.user).toBeNull();
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(frogbot.logger.error.mock.calls).toEqual([
      [{ err: error }, "[frogbot] auth strategy 'shared' on 'users' failed"],
      [{ err: error }, "[frogbot] auth strategy 'shared' on 'members' failed"],
    ]);
  });

  it.each([
    ['synchronous Error', new Error('sync failure')],
    ['non-Error', 'non-Error failure'],
  ])(
    'logs a %s throw and lets the engine authenticate with the next strategy',
    async (_name, error) => {
      const fallback = vi.fn<AuthStrategy['authenticate']>(() => ({ user }));
      const config = await buildConfig(
        makeConfig([
          {
            name: 'broken',
            authenticate: () => {
              throw error;
            },
          },
          { name: 'fallback', authenticate: fallback },
        ]),
      );
      const payload = await makePayload(config);
      const frogbot = makeFrogBot(config);

      registerFrogBotInstance(payload, frogbot, config);

      const result = await run(payload);

      expect(result.user).toBe(user);
      expect(fallback).toHaveBeenCalledOnce();
      expect(frogbot.logger.error).toHaveBeenCalledExactlyOnceWith(
        { err: error },
        "[frogbot] auth strategy 'broken' on 'users' failed",
      );
    },
  );
});
