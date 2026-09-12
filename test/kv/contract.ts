import { setTimeout as sleep } from 'node:timers/promises';

import type { KV, KVLock } from 'frogbot/kv';
import { describe, expect, it } from 'vitest';

export const expiryTTL = 100;
export const waitForExpiry = () => sleep(expiryTTL + 100);

export function kvContract({
  clients,
  restart,
}: {
  clients: () => [KV, KV];
  restart: () => Promise<void>;
}) {
  describe('shared KV contract', () => {
    it('shares ordinary values and mutations between independent clients', async () => {
      const [a, b] = clients();
      expect(a).not.toBe(b);
      await a.set('ordinary', { nested: ['$literal', false, 0], value: null });
      expect(await b.get('ordinary')).toEqual({ nested: ['$literal', false, 0], value: null });
      expect(await b.has('ordinary')).toBe(true);
      expect(await b.keys()).toContain('ordinary');
      await b.set('ordinary', 'replacement');
      expect(await a.get('ordinary')).toBe('replacement');
      await b.delete('ordinary');
      expect(await a.get('ordinary')).toBeNull();
      expect(await a.has('ordinary')).toBe(false);
      await a.set('clear-a', 1);
      await b.set('clear-b', 2);
      await a.clear();
      expect(await b.keys()).toEqual([]);
    });

    it('hides expired values from get, has and keys without cleanup', async () => {
      const [a, b] = clients();
      await a.set('expiring', 'old', { ttl: expiryTTL });
      await a.set('permanent', 'keep');
      expect(await b.get('expiring')).toBe('old');
      await waitForExpiry();
      expect(await b.get('expiring')).toBeNull();
      expect(await a.has('expiring')).toBe(false);
      expect(await b.keys()).toEqual(['permanent']);
    });

    it('clears an old expiration when overwritten without a TTL', async () => {
      const [a, b] = clients();
      await a.set('overwrite', 'old', { ttl: expiryTTL });
      await b.set('overwrite', 'permanent');
      await waitForExpiry();
      expect(await a.get('overwrite')).toBe('permanent');
      expect(await b.has('overwrite')).toBe(true);
      expect(await a.setIfAbsent('overwrite', 'intruder')).toBe(false);
    });

    it('claims persistent values and reclaims expired keys without inheriting their TTL', async () => {
      const [a, b] = clients();
      expect(await a.setIfAbsent('persistent-claim', 'first')).toBe(true);
      expect(await b.setIfAbsent('persistent-claim', 'second')).toBe(false);
      await a.set('expired-claim', 'old', { ttl: expiryTTL });
      await waitForExpiry();
      expect(await b.setIfAbsent('expired-claim', 'successor')).toBe(true);
      await waitForExpiry();
      expect(await a.get('persistent-claim')).toBe('first');
      expect(await a.get('expired-claim')).toBe('successor');
      expect(await a.setIfAbsent('expired-claim', 'intruder')).toBe(false);
    });

    for (const expired of [false, true]) {
      it(`admits exactly one contender on an ${expired ? 'expired' : 'absent'} key`, async () => {
        const stores = clients();
        const key = 'contended';
        if (expired) {
          await stores[0].set(key, 'expired owner', { ttl: expiryTTL });
          await waitForExpiry();
        }
        const attempts = Array.from({ length: 24 }, (_, index) => ({
          store: stores[index % stores.length],
          value: `owner-${index}`,
        }));
        const results = await Promise.all(
          attempts.map(({ store, value }) => store.setIfAbsent(key, value, { ttl: 10_000 })),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
        const winner = attempts[results.indexOf(true)].value;
        expect(await stores[0].get(key)).toBe(winner);
        expect(await stores[1].get(key)).toBe(winner);
      });
    }

    it('admits exactly one lock owner across competing clients', async () => {
      const stores = clients();
      const results = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          stores[index % stores.length].acquireLock('lock-contention', 10_000),
        ),
      );
      const winners = results.filter((lock): lock is KVLock => lock !== null);
      expect(winners).toHaveLength(1);
      expect(await stores[1].get(winners[0].key)).toBe(winners[0].token);
      expect(await stores[1].releaseLock(winners[0])).toBe(true);
    });

    it('rejects wrong owners and permits extension and release by the live owner', async () => {
      const [a, b] = clients();
      const lock = await a.acquireLock('owned', 2_000);
      expect(lock).not.toBeNull();
      const owner = lock!;
      const wrong = { ...owner, token: `wrong-${owner.token}` };
      expect(await b.extendLock(wrong, 10_000)).toBe(false);
      expect(await b.releaseLock(wrong)).toBe(false);
      expect(await b.extendLock(owner, 10_000)).toBe(true);
      expect(await a.get(owner.key)).toBe(owner.token);
      expect(await b.releaseLock(owner)).toBe(true);
      expect(await a.releaseLock(owner)).toBe(false);
      expect(await a.extendLock(owner, 10_000)).toBe(false);
    });

    it('does not shorten a successor lease when the stale owner extends or releases', async () => {
      const [a, b] = clients();
      const stale = await a.acquireLock('successor', expiryTTL);
      expect(stale).not.toBeNull();
      await waitForExpiry();
      expect(await b.extendLock(stale!, 10_000)).toBe(false);
      expect(await b.releaseLock(stale!)).toBe(false);
      const successor = await b.acquireLock('successor', 10_000);
      expect(successor).not.toBeNull();
      expect(successor!.token).not.toBe(stale!.token);
      expect(await a.extendLock(stale!, expiryTTL)).toBe(false);
      expect(await a.releaseLock(stale!)).toBe(false);
      await waitForExpiry();
      expect(await a.get('successor')).toBe(successor!.token);
      expect(await a.acquireLock('successor', 10_000)).toBeNull();
      expect(await a.releaseLock(successor!)).toBe(true);
    });

    it('actually extends the lease beyond its original expiry', async () => {
      const [a, b] = clients();
      const lock = await a.acquireLock('extended', expiryTTL);
      expect(lock).not.toBeNull();
      expect(await b.extendLock(lock!, 10_000)).toBe(true);
      await waitForExpiry();
      expect(await a.acquireLock('extended', 10_000)).toBeNull();
      expect(await a.get('extended')).toBe(lock!.token);
      expect(await b.releaseLock(lock!)).toBe(true);
    });

    it('does not treat persistent token-shaped values as owned leases', async () => {
      const [a, b] = clients();
      const lock = { key: 'not-a-lease', token: 'plain-string' };
      await a.set(lock.key, lock.token);
      expect(await b.extendLock(lock, 10_000)).toBe(false);
      expect(await b.releaseLock(lock)).toBe(false);
      expect(await a.get(lock.key)).toBe(lock.token);
    });

    it('rejects invalid TTLs without mutating an existing value', async () => {
      const [a, b] = clients();
      await a.set('invalid-ttl', 'keep');
      for (const ttl of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        await expect(b.set('invalid-ttl', 'bad', { ttl })).rejects.toBeInstanceOf(RangeError);
        await expect(b.setIfAbsent('invalid-absent', 'bad', { ttl })).rejects.toBeInstanceOf(
          RangeError,
        );
        await expect(b.acquireLock('invalid-lock', ttl)).rejects.toBeInstanceOf(RangeError);
      }
      expect(await a.get('invalid-ttl')).toBe('keep');
      expect(await a.has('invalid-absent')).toBe(false);
      expect(await a.has('invalid-lock')).toBe(false);
    });

    it('persists values and live ownership across a complete runtime restart', async () => {
      const [a] = clients();
      await a.set('restart-permanent', { durable: true });
      await a.set('restart-expired', 'old', { ttl: expiryTTL });
      const lock = await a.acquireLock('restart-lock', 60_000);
      expect(lock).not.toBeNull();
      await waitForExpiry();
      await restart();
      const [fresh, peer] = clients();
      expect(fresh).not.toBe(a);
      expect(await fresh.get('restart-permanent')).toEqual({ durable: true });
      expect(await peer.get('restart-expired')).toBeNull();
      expect(await peer.get('restart-lock')).toBe(lock!.token);
      expect(await fresh.acquireLock('restart-lock', 10_000)).toBeNull();
      expect(await peer.releaseLock(lock!)).toBe(true);
    });
  });
}
