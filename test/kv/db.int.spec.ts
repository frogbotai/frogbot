import assert from 'node:assert/strict';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import type { PostgresAdapter } from '@frogbotai/db-postgres';
import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { databaseKVAdapter } from 'frogbot/kv';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { expiryTTL, kvContract, waitForExpiry } from './contract.js';
import { createKVRuntimeHarness, type KVRuntime } from './runtime.js';

for (const custom of [false, true]) {
  describe(`database KV [${custom ? 'custom collection and table' : 'no kv config'}]`, () => {
    const collection = custom ? 'custom-kv-store' : 'payload-kv';
    const harness = createKVRuntimeHarness(
      custom
        ? {
            kv: () =>
              databaseKVAdapter({
                kvCollectionOverrides: {
                  slug: collection,
                  dbName: 'mapped_kv_records',
                  timestamps: true,
                },
              }),
          }
        : {},
    );
    let first: KVRuntime;
    let second: KVRuntime;

    beforeAll(async () => {
      first = await harness.boot();
      await first.frogbot.kv.set('boot-sentinel', 'must survive second boot');
      second = await harness.boot();
      assert.equal(await second.frogbot.kv.get('boot-sentinel'), 'must survive second boot');
    });

    beforeEach(async () => {
      await first.frogbot.kv.clear();
    });

    afterAll(async () => {
      await harness.close();
    });

    const rows = () =>
      first.frogbot.db.find<{ key: string; data: unknown; expiresAt?: string | null }>({
        collection,
        pagination: false,
        limit: 0,
      });

    async function cleanup() {
      const job = await second.payload.jobs.queue({ task: 'frogbot-cleanup-kv', input: {} });
      const result = await second.payload.jobs.run({
        limit: 1,
        where: { id: { equals: job.id } },
      });
      expect(result.jobStatus?.[job.id]).toEqual({ status: 'success' });
    }

    it('boots separate native connections into the same isolated storage', () => {
      expect(first.frogbot).not.toBe(second.frogbot);
      expect(first.payload).not.toBe(second.payload);
      expect(first.frogbot.db).not.toBe(second.frogbot.db);
      if (first.frogbot.db.name === 'mongoose') {
        const a = first.frogbot.db as unknown as MongooseAdapter;
        const b = second.frogbot.db as unknown as MongooseAdapter;
        expect(a.connection).not.toBe(b.connection);
        expect(a.connection.name).toBe(b.connection.name);
        if (custom) expect(a.collections[collection].collection.name).toBe('mapped_kv_records');
      } else if (first.frogbot.db.name === 'postgres') {
        const a = first.frogbot.db as unknown as PostgresAdapter;
        const b = second.frogbot.db as unknown as PostgresAdapter;
        expect(a.pool).not.toBe(b.pool);
        expect(a.schemaName).toBe(b.schemaName);
        if (custom) expect(a.tableNameMap.get('custom_kv_store')).toBe('mapped_kv_records');
      } else {
        const a = first.frogbot.db as unknown as SQLiteAdapter;
        const b = second.frogbot.db as unknown as SQLiteAdapter;
        expect(a.client).not.toBe(b.client);
        expect(a.clientConfig.url).toBe(b.clientConfig.url);
        if (custom) expect(a.tableNameMap.get('custom_kv_store')).toBe('mapped_kv_records');
      }
    });

    it('registers nullable expiration and one hourly cleanup task', () => {
      const config = first.payload.config;
      const tasks = config.jobs.tasks!.filter(({ slug }) => slug === 'frogbot-cleanup-kv');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].schedule).toMatchObject([{ cron: '0 * * * *', queue: 'default' }]);
      const field = config.collections
        .find(({ slug }) => slug === collection)!
        .fields.find((field) => 'name' in field && field.name === 'expiresAt');
      expect(field).toMatchObject({ type: 'date', index: true });
      expect(field).not.toMatchObject({ required: true });
    });

    it('keeps legacy missing/null expiry rows readable and immune to cleanup', async () => {
      await first.frogbot.db.create({
        collection,
        data: { key: 'legacy-missing', data: 'missing' },
      });
      await first.frogbot.db.create({
        collection,
        data: { key: 'legacy-null', data: { expiry: 'null' }, expiresAt: null },
      });
      await first.frogbot.kv.set('modern-persistent', 'modern');
      await cleanup();
      expect(await second.frogbot.kv.get('legacy-missing')).toBe('missing');
      expect(await second.frogbot.kv.get('legacy-null')).toEqual({ expiry: 'null' });
      expect(await second.frogbot.kv.setIfAbsent('legacy-missing', 'intruder')).toBe(false);
      expect(await second.frogbot.kv.setIfAbsent('legacy-null', 'intruder')).toBe(false);
      expect((await rows()).docs).toHaveLength(3);
    });

    it('expires logically before jobs physically remove only the expired rows', async () => {
      await first.frogbot.kv.set('expired-row', 'old', { ttl: expiryTTL });
      await first.frogbot.kv.set('live-row', 'live', { ttl: 60_000 });
      await first.frogbot.kv.set('persistent-row', 'keep');
      await waitForExpiry();
      expect((await rows()).docs.map(({ key }) => key)).toContain('expired-row');
      expect(await second.frogbot.kv.get('expired-row')).toBeNull();
      expect(await second.frogbot.kv.has('expired-row')).toBe(false);
      expect(await second.frogbot.kv.keys()).not.toContain('expired-row');
      await cleanup();
      expect((await rows()).docs.map(({ key }) => key).sort()).toEqual([
        'live-row',
        'persistent-row',
      ]);
      await cleanup();
      expect(await first.frogbot.kv.get('live-row')).toBe('live');
    });

    it('does not delete successor leases racing with queued cleanup', async () => {
      const keys = Array.from({ length: 16 }, (_, index) => `cleanup-race-${index}`);
      await Promise.all(
        keys.map((key) => first.frogbot.kv.set(key, 'expired', { ttl: expiryTTL })),
      );
      await waitForExpiry();
      expect((await rows()).docs).toHaveLength(keys.length);
      const [successors] = await Promise.all([
        Promise.all(keys.map((key) => first.frogbot.kv.acquireLock(key, 60_000))),
        cleanup(),
      ]);
      expect(successors.every((lock) => lock !== null)).toBe(true);
      await cleanup();
      for (const successor of successors) {
        expect(await second.frogbot.kv.get(successor!.key)).toBe(successor!.token);
      }
      expect((await rows()).docs).toHaveLength(keys.length);
    });

    kvContract({
      clients: () => [first.frogbot.kv, second.frogbot.kv],
      restart: async () => {
        await first.shutdown();
        await second.shutdown();
        first = await harness.boot();
        second = await harness.boot();
      },
    });
  });
}
