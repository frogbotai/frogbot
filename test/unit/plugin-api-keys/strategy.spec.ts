import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiKeyToken } from '../../../packages/plugins/plugin-api-keys/src/server/token.js';
import {
  apiKeyMeHook,
  apiKeyRefusal,
  createApiKeyStrategy,
  refuseRejectedApiKey,
} from '../../../packages/plugins/plugin-api-keys/src/strategy.js';

const strategyOptions = { authCollection: 'users', collectionSlug: 'api-keys', tokenPrefix: 'fb' };

function makeStrategy() {
  return createApiKeyStrategy(strategyOptions);
}

async function loadStrategyModule() {
  vi.resetModules();

  return import('../../../packages/plugins/plugin-api-keys/src/strategy.js');
}

function makeFrogBot() {
  return {
    find: vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1' }] }),
    findByID: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
    db: { updateOne: vi.fn().mockResolvedValue(null) },
    update: vi.fn().mockResolvedValue({}),
    logger: { error: vi.fn() },
  };
}

describe('API key authentication strategy', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('authenticates an active key as its owner', async () => {
    const frogbot = makeFrogBot();
    const token = createApiKeyToken();

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${token}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      collection: 'users',
      _strategy: 'api-key',
      apiKeyId: 'key-1',
      apiKey: { id: 'key-1', owner: 'user-1' },
    });
    expect(frogbot.db.updateOne).toHaveBeenCalledExactlyOnceWith({
      collection: 'api-keys',
      id: 'key-1',
      data: { lastUsedAt: expect.any(String) },
      returning: false,
    });
    expect(frogbot.update).not.toHaveBeenCalled();
  });

  it('puts the key document without its hash on the request actor', async () => {
    const frogbot = makeFrogBot();

    frogbot.find.mockResolvedValue({
      docs: [
        {
          id: 'key-1',
          owner: 'user-1',
          tokenHash: 'hash',
          capture: 'enabled',
          captureSampleRate: 0.25,
        },
      ],
    });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toMatchObject({
      apiKeyId: 'key-1',
      apiKey: { id: 'key-1', owner: 'user-1', capture: 'enabled', captureSampleRate: 0.25 },
    });
    expect(result.user).not.toHaveProperty('capture');
    expect(result.user).not.toHaveProperty('captureSampleRate');
    expect(result.user).not.toHaveProperty('apiKey.tokenHash');
  });

  it.each([
    ['missing', new Headers()],
    ['malformed', new Headers({ authorization: 'Bearer invalid' })],
  ])('does not authenticate %s tokens', async (_name, headers) => {
    const frogbot = makeFrogBot();

    const result = await makeStrategy().authenticate({ headers, frogbot: frogbot as never });

    expect(result).toEqual({
      user: null,
    });
    expect(frogbot.find).not.toHaveBeenCalled();
  });

  it('does not authenticate unknown or revoked keys', async () => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({ docs: [] });
    const token = createApiKeyToken();

    expect(
      await makeStrategy().authenticate({
        headers: new Headers({ 'x-api-key': token }),
        frogbot: frogbot as never,
      }),
    ).toEqual({ user: null });
    expect(frogbot.findByID).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a revoked key',
      { revokedAt: '2026-01-01T00:00:00.000Z' },
      'API key was revoked at 2026-01-01T00:00:00.000Z. Mint a new one with POST /v1/api-keys/mint.',
    ],
    [
      'an expired key',
      { expiresAt: '2026-01-01T00:00:00+01:00' },
      'API key expired at 2025-12-31T23:00:00.000Z. Mint a new one with POST /v1/api-keys/mint.',
    ],
  ])('refuses %s and records why on the request', async (_name, fields, message) => {
    const frogbot = makeFrogBot();
    const req = { payload: { config: { routes: { api: '/v1/' } } } };

    frogbot.find.mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1', ...fields }] });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ 'x-api-key': createApiKeyToken() }),
      frogbot: frogbot as never,
      req: req as never,
    });

    expect(result).toEqual({ user: null });
    expect(apiKeyRefusal(req)).toBe(message);
    expect(frogbot.findByID).not.toHaveBeenCalled();
    expect(frogbot.update).not.toHaveBeenCalled();
  });

  describe('refuseRejectedApiKey', () => {
    async function refusedRequest(user: unknown = null) {
      const req = { user, payload: { config: { routes: { api: '/api' } } } };
      const frogbot = makeFrogBot();

      frogbot.find.mockResolvedValue({
        docs: [{ id: 'key-1', owner: 'user-1', revokedAt: '2026-01-01T00:00:00.000Z' }],
      });

      await makeStrategy().authenticate({
        headers: new Headers({ 'x-api-key': createApiKeyToken() }),
        frogbot: frogbot as never,
        req: req as never,
      });

      return req as { responseHeaders?: Headers };
    }

    const run = (req: object, overrideAccess = false) =>
      refuseRejectedApiKey({ overrideAccess, req } as never);

    it('answers 401 with the reason and a Bearer challenge', async () => {
      const req = await refusedRequest();
      const message =
        'API key was revoked at 2026-01-01T00:00:00.000Z. Mint a new one with POST /api/api-keys/mint.';

      expect(() => run(req)).toThrow(expect.objectContaining({ message, status: 401 }));
      expect(req.responseHeaders?.get('WWW-Authenticate')).toBe(
        `Bearer error="invalid_token", error_description="${message}"`,
      );
    });

    it('lets the operation run when another strategy signed someone in, or access is overridden', async () => {
      expect(run(await refusedRequest({ id: 'user-1' }))).toBeUndefined();
      expect(run(await refusedRequest(), true)).toBeUndefined();
      expect(run({ user: null })).toBeUndefined();
    });
  });

  it('does not authenticate a deleted owner', async () => {
    const frogbot = makeFrogBot();
    frogbot.findByID.mockRejectedValue(new Error('Not found'));
    const token = createApiKeyToken();

    expect(
      await makeStrategy().authenticate({
        headers: new Headers({ 'x-api-key': token }),
        frogbot: frogbot as never,
      }),
    ).toEqual({ user: null });
    expect(frogbot.db.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ['missing key ID', { owner: 'user-1' }],
    ['invalid key ID', { id: {}, owner: 'user-1' }],
    ['missing owner', { id: 'key-1' }],
    ['populated owner', { id: 'key-1', owner: { id: 'user-1' } }],
  ])('does not authenticate a key with %s', async (_name, key) => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({ docs: [key] });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result).toEqual({ user: null });
    expect(frogbot.findByID).not.toHaveBeenCalled();
    expect(frogbot.db.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ['no expiresAt', null],
    ['a future expiresAt', new Date(Date.now() + 60_000).toISOString()],
  ])('authenticates a key with %s and stamps lastUsedAt', async (_name, expiresAt) => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1', expiresAt }] });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toMatchObject({ id: 'user-1', apiKeyId: 'key-1' });
    expect(frogbot.db.updateOne).toHaveBeenCalledOnce();
  });

  it('signs a key in until its expiresAt, then as nobody without stamping lastUsedAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T12:00:00.000Z') });

    const frogbot = makeFrogBot();

    frogbot.find.mockResolvedValue({
      docs: [{ id: 'key-1', owner: 'user-1', expiresAt: '2026-11-09T00:00:00.000Z' }],
    });

    const authenticate = () =>
      makeStrategy().authenticate({
        headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
        frogbot: frogbot as never,
      });

    expect((await authenticate()).user).toMatchObject({ id: 'user-1' });
    expect(frogbot.db.updateOne).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date('2026-11-09T00:00:00.000Z'));

    expect(await authenticate()).toEqual({ user: null });
    expect(frogbot.findByID).toHaveBeenCalledOnce();
    expect(frogbot.db.updateOne).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', undefined],
    ['a minute old', '2026-11-08T11:59:00.000Z'],
    ['in the future by over a minute', '2026-11-08T12:01:01.000Z'],
  ])('stamps lastUsedAt when it is %s', async (_name, lastUsedAt) => {
    vi.useFakeTimers({ now: new Date('2026-11-08T12:00:00.000Z') });

    const frogbot = makeFrogBot();

    frogbot.find.mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1', lastUsedAt }] });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toMatchObject({ id: 'user-1' });
    expect(frogbot.db.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastUsedAt: '2026-11-08T12:00:00.000Z' } }),
    );
  });

  it.each([
    ['just now', '2026-11-08T12:00:00.000Z'],
    ['59 seconds ago', '2026-11-08T11:59:01.000Z'],
    ['a Date 30 seconds ago', new Date('2026-11-08T11:59:30.000Z')],
  ])('skips the lastUsedAt write when it was stamped %s', async (_name, lastUsedAt) => {
    vi.useFakeTimers({ now: new Date('2026-11-08T12:00:00.000Z') });

    const frogbot = makeFrogBot();

    frogbot.find.mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1', lastUsedAt }] });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toMatchObject({ id: 'user-1', apiKeyId: 'key-1' });
    expect(frogbot.find).toHaveBeenCalledOnce();
    expect(frogbot.db.updateOne).not.toHaveBeenCalled();
  });

  it('signs the key in when the lastUsedAt write fails, logging the failure once', async () => {
    const { createApiKeyStrategy: create } = await loadStrategyModule();
    const frogbot = makeFrogBot();
    const conflict = new Error('WriteConflict');

    frogbot.db.updateOne.mockRejectedValue(conflict);

    const strategy = create(strategyOptions);
    const authenticate = () =>
      strategy.authenticate({
        headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
        frogbot: frogbot as never,
      });

    expect((await authenticate()).user).toMatchObject({ id: 'user-1', apiKeyId: 'key-1' });
    expect((await authenticate()).user).toMatchObject({ id: 'user-1', apiKeyId: 'key-1' });
    expect(frogbot.db.updateOne).toHaveBeenCalledTimes(2);
    expect(frogbot.logger.error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ err: conflict }),
      expect.stringContaining('lastUsedAt'),
    );
  });

  it('logs a failed lastUsedAt write once per process across strategy instances', async () => {
    const { createApiKeyStrategy: create } = await loadStrategyModule();
    const frogbot = makeFrogBot();

    frogbot.db.updateOne.mockRejectedValue(new Error('WriteConflict'));

    const authenticate = () =>
      create(strategyOptions).authenticate({
        headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
        frogbot: frogbot as never,
      });

    expect((await authenticate()).user).toMatchObject({ id: 'user-1' });
    expect((await authenticate()).user).toMatchObject({ id: 'user-1' });
    expect(frogbot.logger.error).toHaveBeenCalledOnce();
  });

  it('authenticates numeric key and owner IDs including zero', async () => {
    const frogbot = makeFrogBot();
    frogbot.find.mockResolvedValue({ docs: [{ id: 0, owner: 0 }] });
    frogbot.findByID.mockResolvedValue({ id: 0, email: 'test@example.com' });

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: `Bearer ${createApiKeyToken()}` }),
      frogbot: frogbot as never,
    });

    expect(result.user).toMatchObject({ id: 0, apiKeyId: 0 });
    expect(frogbot.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 0 }),
    );
    expect(frogbot.db.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'api-keys', id: 0 }),
    );
  });

  it('authenticates through a key header when the Bearer value is not a key', async () => {
    const frogbot = makeFrogBot();

    const result = await makeStrategy().authenticate({
      headers: new Headers({ authorization: 'Bearer not-a-jwt', 'x-api-key': createApiKeyToken() }),
      frogbot: frogbot as never,
    });

    expect(result.user).toMatchObject({ id: 'user-1', _strategy: 'api-key' });
  });
});

describe('API key me hook', () => {
  it('returns the current user without a token expiry for API key requests', async () => {
    const user = { id: 'user-1', collection: 'users', _strategy: 'api-key' };

    const result = await apiKeyMeHook({ args: {} as never, user });

    expect(result).toEqual({ user });
  });

  it.each([
    ['another strategy', { id: 'user-1', collection: 'users', _strategy: 'local-jwt' }],
    ['no user', null],
  ])('leaves %s to the default handling', async (_name, user) => {
    expect(await apiKeyMeHook({ args: {} as never, user })).toBeUndefined();
  });
});
