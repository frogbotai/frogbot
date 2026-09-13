import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import {
  ConnectionStore,
  type ConnectionStoreLock,
} from '../../../../packages/frogbot/src/connections/store.js';
import type { SanitizedConnectionsConfig } from '../../../../packages/frogbot/src/connections/types.js';
import { KVLeaseLostError } from '../../../../packages/frogbot/src/kv/errors.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';
import type { KVLockCallback } from '../../../../packages/frogbot/src/kv/types.js';

const owner = { id: 1, collection: 'users' };
const piece = 'example';
const write = { method: 'secret' as const, credential: 'secret-value' };

function harness() {
  const config: SanitizedConnectionsConfig = {
    enabled: true,
    slug: 'connections',
    entries: { example: { piece: {} as never, oauth: false, secret: true } },
    encryption: createCredentialEncryption({ secret: 'test-secret' }),
  };
  const atomic = {
    acquireLock: vi.fn(async (key: string) => ({ key, token: 'token' })),
    extendLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => true),
  };
  const frogbot = {
    find: vi.fn(async () => ({ docs: [] })),
    create: vi.fn(async ({ data }) => ({ ...data, id: 1 })),
    update: vi.fn(async ({ data, id }) => ({ ...data, id })),
    delete: vi.fn(async () => ({})),
    kv: {
      lock: <T>(key: string, ttl: number, fn: KVLockCallback<T>) =>
        runKVLock({ kv: atomic, key, ttl, fn }),
    },
  };
  const store = new ConnectionStore({ frogbot: frogbot as never, config, userSlug: 'users' });
  return { config, atomic, frogbot, store };
}

describe('connection store guards and leases', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { id: 1, collection: 'customers' },
    { id: 1 },
    { id: '', collection: 'users' },
    { id: NaN, collection: 'users' },
  ])('rejects invalid owner %j before storage or lock access', async (invalid) => {
    const { store, frogbot, atomic } = harness();
    const args = { owner: invalid as typeof owner, piece };
    await expect(store.list(args)).rejects.toThrow('admin user collection');
    await expect(store.get(args)).rejects.toThrow('admin user collection');
    await expect(store.upsert({ ...args, ...write })).rejects.toThrow('admin user collection');
    await expect(store.delete(args)).rejects.toThrow('admin user collection');
    expect(frogbot.find).not.toHaveBeenCalled();
    expect(atomic.acquireLock).not.toHaveBeenCalled();
  });

  it.each(['custom-instance', 'toString', '__proto__'])(
    'rejects noncanonical piece %s',
    async (slug) => {
      const { store, atomic } = harness();
      await expect(store.upsert({ owner, piece: slug, ...write })).rejects.toThrow(
        'not configured',
      );
      expect(atomic.acquireLock).not.toHaveBeenCalled();
    },
  );

  it('rejects disabled methods and encryption failure without writing', async () => {
    const { store, frogbot, config } = harness();
    await expect(store.upsert({ owner, piece, ...write, method: 'oauth' })).rejects.toThrow(
      'not enabled',
    );
    vi.spyOn(config.encryption, 'encrypt').mockRejectedValue(new Error('encryption failed'));
    await expect(store.upsert({ owner, piece, ...write })).rejects.toThrow('encryption failed');
    expect(frogbot.create).not.toHaveBeenCalled();
    expect(frogbot.update).not.toHaveBeenCalled();
  });

  it('renews throughout a slow refresh and closes callback operations after release', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const { store, atomic } = harness();
    let locked!: ConnectionStoreLock;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = store.withLock({
      owner,
      piece,
      fn: async (operations) => {
        locked = operations;
        await operations.get();
        await pending;
        return operations.upsert(write);
      },
    });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(atomic.extendLock).toHaveBeenCalledTimes(4);
    expect(locked.signal.aborted).toBe(false);
    finish();
    await expect(result).resolves.toMatchObject({ id: 1 });
    expect(atomic.releaseLock).toHaveBeenCalledOnce();
    await expect(locked.upsert(write)).rejects.toThrow('closed');
    await expect(locked.get()).rejects.toThrow('closed');
    await expect(locked.delete()).rejects.toThrow('closed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts on lost renewal and blocks a late refresh write', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const { store, atomic, frogbot } = harness();
    atomic.extendLock.mockResolvedValue(false);
    let locked!: ConnectionStoreLock;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = store.withLock({
      owner,
      piece,
      fn: async (operations) => {
        locked = operations;
        await pending;
        return operations.upsert(write);
      },
    });
    const rejected = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await rejected).toBeInstanceOf(KVLeaseLostError);
    expect(locked.signal.aborted).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(frogbot.create).not.toHaveBeenCalled();
    expect(frogbot.update).not.toHaveBeenCalled();
    await expect(locked.delete()).rejects.toBeInstanceOf(KVLeaseLostError);
    expect(vi.getTimerCount()).toBe(0);
  });
});
