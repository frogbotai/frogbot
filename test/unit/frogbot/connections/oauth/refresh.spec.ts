import { afterEach, describe, expect, it, vi } from 'vitest';

import { Connections } from '../../../../../packages/frogbot/src/connections/api.js';
import type { OAuthTokens } from '../../../../../packages/frogbot/src/pieces/types.js';
import { connectionSetup, definition } from './fixtures.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('lazy connection refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refreshes once across concurrent resolvers and runtimes under the shared store lock', async () => {
    const gate = deferred<OAuthTokens>();
    const entered = deferred<void>();
    const refresh = vi.fn(() => {
      entered.resolve();
      return gate.promise;
    });
    const fixture = await connectionSetup({
      ...definition,
      oauth: { ...definition.oauth, refresh },
    });
    const { api, piece, req, frogbot, config } = fixture;
    const other = new Connections(frogbot as never, config);
    const first = api.resolvePieceCredential({ piece, req });
    await entered.promise;
    const followers = Array.from({ length: 8 }, (_, i) =>
      (i % 2 ? other : api).resolvePieceCredential({ piece, req }),
    );
    gate.resolve({ access_token: 'fresh', expires_in: 3600 });
    const results = await Promise.all([first, ...followers]);
    expect(results.map(({ auth }) => auth)).toEqual(
      Array.from({ length: 9 }, () => ({ token: 'fresh' })),
    );
    expect(results[0]!.key).toBe(results[1]!.key);
    expect((await api.resolvePieceCredential({ piece, req })).key).toBe(results[0]!.key);
    expect(refresh).toHaveBeenCalledOnce();
    expect(frogbot.update).toHaveBeenCalledOnce();
    const row = await (
      await api.store
    ).get({ owner: { id: 'owner', collection: 'users' }, piece: 'example' });
    expect(row?.credential).toMatchObject({
      access_token: 'fresh',
      refresh_token: 'refresh',
      vendor: { tenant: 'one' },
    });
    expect(row?.scopes).toEqual(['read']);
  });

  it('rebuilds a client after refresh and then keeps its stable credential key', async () => {
    const client = vi.fn(({ auth }) => ({ auth }));
    const fixture = await connectionSetup({
      ...definition,
      client,
      oauth: {
        ...definition.oauth,
        refresh: async () => ({ access_token: 'fresh', expires_in: 3600 }),
      },
    });
    fixture.row()!.expiresAt = '2099-01-01T00:00:00Z';
    const old = await fixture.piece.client({ req: fixture.req });
    fixture.row()!.expiresAt = '2000-01-01T00:00:00Z';
    const fresh = await fixture.piece.client({ req: fixture.req });
    expect(fresh).not.toBe(old);
    expect(fresh).toEqual({ auth: { token: 'fresh' } });
    expect(await fixture.piece.client({ req: fixture.req })).toBe(fresh);
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('uses the refresh grant when the recipe has no custom refresh', async () => {
    const fixture = await connectionSetup();
    const fetch = vi.fn(async () => Response.json({ access_token: 'fresh', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetch);
    await expect(fixture.api.resolve(fixture)).resolves.toEqual({ token: 'fresh' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(['provider', 'invalid', 'expired', 'auth', 'missing-refresh'])(
    'marks %s refresh failure as error without factory fallback or retry',
    async (failure) => {
      const refresh = vi.fn(async () => {
        if (failure === 'provider') throw new Error('secret-error');
        return {
          access_token: failure === 'invalid' ? '' : 'fresh',
          expires_in: failure === 'expired' ? 0 : 3600,
        };
      });
      const fixture = await connectionSetup({
        ...definition,
        oauth: {
          ...definition.oauth,
          refresh: failure === 'missing-refresh' ? undefined : refresh,
          ...(failure === 'auth' ? { toAuth: () => ({ token: '' }) } : {}),
        },
      });
      if (failure === 'missing-refresh') {
        fixture.row()!.credential = await fixture.encryption.encrypt(
          JSON.stringify({ access_token: 'old' }),
        );
      }
      const encrypted = fixture.row()!.credential;
      await expect(fixture.api.resolve(fixture)).rejects.toMatchObject({
        name: 'ConnectionError',
        code: 'error',
      });
      expect(fixture.row()?.status).toBe('error');
      expect(await fixture.encryption.decrypt(fixture.row()!.credential)).toBe(
        await fixture.encryption.decrypt(encrypted),
      );
      await expect(fixture.api.resolve(fixture)).rejects.toMatchObject({ code: 'error' });
      expect(refresh).toHaveBeenCalledTimes(failure === 'missing-refresh' ? 0 : 1);
    },
  );

  it('checks scopes on the refreshed grant, including explicitly reduced scope', async () => {
    const fixture = await connectionSetup({
      ...definition,
      oauth: {
        ...definition.oauth,
        refresh: async () => ({ access_token: 'fresh', expires_in: 3600, scope: '' }),
      },
    });
    await expect(
      fixture.api.resolve({ ...fixture, scopes: ['read', 'write', 'write'] }),
    ).rejects.toMatchObject({ code: 'scopes', missingScopes: ['read', 'write'] });
    expect(fixture.row()?.status).toBe('active');
    expect(fixture.row()?.scopes).toEqual([]);
  });

  it('rereads under the lock and honors a relink completed before lock acquisition', async () => {
    const refresh = vi.fn(async () => ({ access_token: 'fresh' }));
    const fixture = await connectionSetup({
      ...definition,
      oauth: { ...definition.oauth, refresh },
    });
    const store = await fixture.api.store;
    const withLock = store.withLock.bind(store);
    vi.spyOn(store, 'withLock').mockImplementationOnce(async (args) => {
      await withLock({
        owner: args.owner,
        piece: args.piece,
        fn: (locked) => locked.upsert({ method: 'secret', credential: { token: 'relinked' } }),
      });
      return withLock(args);
    });
    await expect(fixture.api.resolve(fixture)).resolves.toEqual({ token: 'relinked' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(['relink-success', 'relink-failure', 'delete-success', 'delete-failure'])(
    'never overwrites a concurrent %s',
    async (scenario) => {
      const gate = deferred<OAuthTokens>();
      const entered = deferred<void>();
      const fixture = await connectionSetup({
        ...definition,
        oauth: {
          ...definition.oauth,
          refresh: () => {
            entered.resolve();
            return gate.promise;
          },
        },
      });
      const pending = fixture.api.resolve(fixture);
      const outcome = pending.catch((error: unknown) => error);
      await entered.promise;
      fixture.replace(
        scenario.startsWith('delete')
          ? undefined
          : {
              ...fixture.row()!,
              method: 'secret',
              credential: await fixture.encryption.encrypt(JSON.stringify({ token: 'relinked' })),
              expiresAt: null,
            },
      );
      if (scenario.endsWith('failure')) gate.reject(new Error('provider failed'));
      else gate.resolve({ access_token: 'late', expires_in: 3600 });
      expect(await outcome).toMatchObject(
        scenario.startsWith('delete') ? { code: 'missing' } : { token: 'relinked' },
      );
      expect(fixture.frogbot.update).not.toHaveBeenCalled();
      expect(fixture.frogbot.create).not.toHaveBeenCalled();
    },
  );

  it('aborts refresh on lost renewable lease and blocks late success writes', async () => {
    vi.useFakeTimers();
    const gate = deferred<OAuthTokens>();
    const entered = deferred<void>();
    const fixture = await connectionSetup({
      ...definition,
      oauth: {
        ...definition.oauth,
        refresh: () => {
          entered.resolve();
          return gate.promise;
        },
      },
    });
    fixture.adapter.extendLock.mockResolvedValue(false);
    const pending = fixture.api.resolve(fixture);
    const outcome = pending.catch((error: unknown) => error);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toMatchObject({ code: 'error' });
    gate.resolve({ access_token: 'late', expires_in: 3600 });
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.adapter.extendLock).toHaveBeenCalledOnce();
    expect(fixture.frogbot.update).not.toHaveBeenCalled();
    expect(fixture.row()?.status).toBe('active');
  });

  it('times out a recipe refresh, marks error under the lease, and ignores late completion', async () => {
    vi.useFakeTimers();
    const gate = deferred<OAuthTokens>();
    const entered = deferred<void>();
    const fixture = await connectionSetup({
      ...definition,
      oauth: {
        ...definition.oauth,
        refresh: () => {
          entered.resolve();
          return gate.promise;
        },
      },
    });
    const pending = fixture.api.resolve(fixture);
    const outcome = pending.catch((error: unknown) => error);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toMatchObject({ code: 'error' });
    expect(fixture.adapter.extendLock).toHaveBeenCalledOnce();
    expect(fixture.row()?.status).toBe('error');
    gate.resolve({ access_token: 'late', expires_in: 3600 });
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.frogbot.update).toHaveBeenCalledOnce();
  });
});
