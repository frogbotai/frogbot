import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import type { BaseDatabaseAdapter } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createMongoKV } from '../../packages/frogbot/src/kv/adapters/mongo.js';
import { KVUnsupportedError } from '../../packages/frogbot/src/kv/errors.js';
import type { KVDatabaseAdapter } from '../../packages/frogbot/src/kv/types.js';

const primary = { readPreference: 'primary' as const };
const require = createRequire(new URL('../../packages/db-mongodb/package.json', import.meta.url));

describe.skipIf(process.env.FROGBOT_DATABASE !== 'mongodb')('native Mongo KV transactions', () => {
  let mongoose: any;
  let first: MongooseAdapter['connection'];
  let second: MongooseAdapter['connection'];
  let model: MongooseAdapter['collections'][string];
  let other: MongooseAdapter['collections'][string];
  let kv: KVDatabaseAdapter;
  let peer: KVDatabaseAdapter;

  function store(nativeModel: object) {
    return createMongoKV({
      adapter: {
        collections: { logical: nativeModel },
        upsert: async ({ data }: Parameters<BaseDatabaseAdapter['upsert']>[0]) =>
          (nativeModel as typeof model).findOneAndUpdate(
            { key: data.key },
            { $set: data },
            { ...primary, upsert: true, new: true },
          ),
      } as unknown as BaseDatabaseAdapter,
      collectionSlug: 'logical',
    });
  }

  beforeAll(async () => {
    mongoose = createRequire(require.resolve('@payloadcms/db-mongodb'))('mongoose');
    const url = new URL(
      process.env.MONGODB_URI || 'mongodb://localhost:27018?directConnection=true&replicaSet=rs0',
    );
    url.pathname = `/kv_native_${randomUUID().replaceAll('-', '')}`;
    first = await mongoose.createConnection(url.toString(), { monitorCommands: true }).asPromise();
    const schema = () =>
      new mongoose.Schema(
        {
          key: { type: String, unique: true, required: true },
          data: { type: mongoose.Schema.Types.Mixed, required: true },
          expiresAt: { type: Date, index: true },
          source: { type: String, default: 'configured-default' },
        },
        { timestamps: true },
      );
    model = first.model('logical', schema(), 'mapped_native_kv') as typeof model;
    await model.init();
    second = await mongoose
      .createConnection(url.toString(), { readPreference: 'secondary' })
      .asPromise();
    other = second.model('logical', schema(), 'mapped_native_kv') as typeof other;
    kv = store(model);
    peer = store(other);
    await Promise.all([kv.keys(), peer.keys()]);
  });

  beforeEach(async () => {
    await kv.clear();
  });

  afterAll(async () => {
    try {
      await first?.dropDatabase();
    } finally {
      await Promise.all([first?.close(), second?.close()]);
    }
  });

  async function block<T>({
    key,
    run,
    missing = false,
    commit = false,
  }: {
    key: string;
    run: () => Promise<T>;
    missing?: boolean;
    commit?: boolean;
  }): Promise<T> {
    const session = await second.startSession();
    session.startTransaction({ readPreference: 'primary' });
    if (missing) {
      await other.collection.insertOne({ key, data: 'uncommitted' }, { ...primary, session });
    } else {
      await other.collection.updateOne(
        { key },
        [{ $set: { data: 'uncommitted', expiresAt: { $add: ['$$NOW', 60_000] } } }],
        { ...primary, session },
      );
    }
    const client = first.getClient();
    let started = false;
    const listener = (event: { command: Record<string, any> }) => {
      const command = event.command;
      if (
        command.query?.key === key ||
        command.updates?.some((update: any) => update.q.key === key) ||
        command.documents?.some((doc: any) => doc.key === key) ||
        command.deletes?.some(
          (entry: any) =>
            entry.q.key === key || (command.delete === model.collection.name && entry.q.$expr),
        )
      ) {
        started = true;
      }
    };
    client.on('commandStarted', listener);
    const pending = run();
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    try {
      await expect.poll(() => started, { timeout: 3000 }).toBe(true);
      await delay(500);
      expect(settled).toBe(false);
      if (commit) await session.commitTransaction();
      else await session.abortTransaction();
      return await pending;
    } finally {
      client.off('commandStarted', listener);
      if (session.inTransaction()) await session.abortTransaction();
      await pending.catch(() => undefined);
      await session.endSession();
    }
  }

  it.each(['extend', 'release'] as const)(
    'does not %s a lease that expires while waiting for a writer',
    async (operation) => {
      await kv.set('held', 'owner', { ttl: 200 });
      const before = await model.collection.findOne({ key: 'held' }, primary);
      const result = await block({
        key: 'held',
        run: () =>
          operation === 'extend'
            ? kv.extendLock({ key: 'held', token: 'owner' }, 60_000)
            : kv.releaseLock({ key: 'held', token: 'owner' }),
      });
      expect(result).toBe(false);
      expect(await model.collection.findOne({ key: 'held' }, primary)).toEqual(before);
      expect(await peer.get('held')).toBeNull();
    },
  );

  it.each(['missing', 'expired', 'set'] as const)(
    'starts %s TTL after write contention, not at command start',
    async (operation) => {
      if (operation !== 'missing') {
        await kv.set('held', 'old');
        await model.collection.updateOne({ key: 'held' }, [
          { $set: { expiresAt: { $subtract: ['$$NOW', 1] } } },
        ]);
      }
      const result = await block({
        key: 'held',
        missing: operation === 'missing',
        run: async () => {
          if (operation === 'set') {
            await kv.set('held', 'new', { ttl: 200 });
            return true;
          }
          return kv.setIfAbsent('held', 'new', { ttl: 200 });
        },
      });
      expect(result).toBe(true);
      const [row] = await model.collection
        .aggregate(
          [
            { $match: { key: 'held' } },
            { $project: { remaining: { $subtract: ['$expiresAt', '$$NOW'] }, data: 1 } },
          ],
          primary,
        )
        .toArray();
      expect(row.data).toBe('new');
      expect(row.remaining).toBeGreaterThan(0);
      expect(row.remaining).toBeLessThanOrEqual(200);
    },
  );

  it('keeps renewed rows when a conditional cleanup delete waits for a writer', async () => {
    await kv.set('held', 'expired');
    await model.collection.updateOne({ key: 'held' }, [
      { $set: { expiresAt: { $subtract: ['$$NOW', 1] } } },
    ]);
    await block({ key: 'held', run: () => kv.cleanup(), commit: true });
    expect(await peer.get('held')).toBe('uncommitted');
  });

  it('preserves defaults, ObjectId IDs, and backend timestamps across replacements and renewal', async () => {
    await kv.set('record', 'owner', { ttl: 60_000 });
    const original = await model.collection.findOne({ key: 'record' }, primary);
    expect(original!._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(original!.source).toBe('configured-default');
    expect(original!.createdAt).toBeInstanceOf(Date);
    expect(original!.updatedAt).toEqual(original!.createdAt);
    expect(original!.expiresAt.getTime() - original!.createdAt.getTime()).toBe(60_000);
    await model.collection.updateOne({ key: 'record' }, { $set: { source: 'preserved' } });
    await delay(5);
    expect(await peer.extendLock({ key: 'record', token: 'owner' }, 60_000)).toBe(true);
    await kv.set('record', { value: '$$NOW' });
    const replaced = await model.collection.findOne({ key: 'record' }, primary);
    expect(replaced!._id).toEqual(original!._id);
    expect(replaced!.createdAt).toEqual(original!.createdAt);
    expect(replaced!.updatedAt.getTime()).toBeGreaterThan(original!.updatedAt.getTime());
    expect(replaced!.source).toBe('preserved');
    expect(replaced!.expiresAt).toBeNull();
    expect(await peer.get('record')).toEqual({ value: '$$NOW' });
  });

  it('supports renamed and disabled timestamps', async () => {
    const named = first.model(
      'named',
      new mongoose.Schema(
        {
          key: { type: String, unique: true },
          data: mongoose.Schema.Types.Mixed,
          expiresAt: Date,
        },
        { timestamps: { createdAt: 'born', updatedAt: false } },
      ),
    );
    const storage = store(named);
    await storage.set('key', 'value');
    const row = await named.collection.findOne({ key: 'key' }, primary);
    expect(row!.born).toBeInstanceOf(Date);
    expect(row).not.toHaveProperty('updatedAt');
    expect(row).not.toHaveProperty('createdAt');
  });

  it.each([Number, String])(
    'preserves basic custom %s IDs and rejects extended writes',
    async (id) => {
      const expectedID = id === Number ? 7 : 'custom-id';
      const custom = first.model(
        `custom-${id.name}`,
        new mongoose.Schema({
          _id: { type: id, default: () => expectedID },
          key: { type: String, unique: true },
          data: mongoose.Schema.Types.Mixed,
          expiresAt: Date,
          source: { type: String, default: 'custom-default' },
        }),
      );
      const storage = store(custom);
      await storage.set('key', 'value');
      const original = await custom.collection.findOne({ key: 'key' }, primary);
      expect(original!._id).toBe(expectedID);
      expect(original!.source).toBe('custom-default');
      expect(original!.expiresAt).toBeNull();
      expect(await storage.get('key')).toBe('value');
      expect(await storage.has('key')).toBe(true);
      expect(await storage.keys()).toEqual(['key']);
      await expect(storage.set('key', 'intruder', { ttl: 1000 })).rejects.toBeInstanceOf(
        KVUnsupportedError,
      );
      await expect(storage.setIfAbsent('key', 'intruder')).rejects.toBeInstanceOf(
        KVUnsupportedError,
      );
      await expect(storage.extendLock({ key: 'key', token: 'value' }, 1000)).rejects.toBeInstanceOf(
        KVUnsupportedError,
      );
      await expect(storage.releaseLock({ key: 'key', token: 'value' })).rejects.toBeInstanceOf(
        KVUnsupportedError,
      );
      expect(await custom.collection.findOne({ key: 'key' }, primary)).toEqual(original);
      await storage.cleanup();
      expect(await storage.get('key')).toBe('value');
      await custom.collection.updateOne({ key: 'key' }, [
        { $set: { expiresAt: { $subtract: ['$$NOW', 1] } } },
      ]);
      expect(await storage.get('key')).toBeNull();
      await storage.cleanup();
      expect(await custom.collection.countDocuments({}, primary)).toBe(0);
      await storage.set('key', 'replacement');
      await storage.delete('key');
      expect(await storage.has('key')).toBe(false);
      await storage.set('key', 'replacement');
      await storage.clear();
      expect(await storage.keys()).toEqual([]);
    },
  );

  it('has one winner for missing and expired claims across independent clients', async () => {
    for (const expired of [false, true]) {
      if (expired) {
        await model.collection.updateOne({ key: 'race' }, [
          { $set: { expiresAt: { $subtract: ['$$NOW', 1] } } },
        ]);
      }
      const results = await Promise.all(
        Array.from({ length: 32 }, (_, index) =>
          (index % 2 ? kv : peer).setIfAbsent('race', `token-${index}`, { ttl: 60_000 }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await peer.has('race')).toBe(true);
      expect(await peer.keys()).toEqual(['race']);
    }
  });

  it('rolls back serialization and inserts on overflow or unrelated unique failures', async () => {
    await kv.set('existing', 'owner', { ttl: 60_000 });
    const original = await model.collection.findOne({ key: 'existing' }, primary);
    await expect(
      kv.set('existing', 'replacement', { ttl: Number.MAX_SAFE_INTEGER }),
    ).rejects.toThrow(RangeError);
    await expect(
      kv.extendLock({ key: 'existing', token: 'owner' }, Number.MAX_SAFE_INTEGER),
    ).rejects.toThrow(RangeError);
    await expect(
      kv.setIfAbsent('missing', 'new', { ttl: Number.MAX_SAFE_INTEGER }),
    ).rejects.toThrow(RangeError);
    expect(await model.collection.findOne({ key: 'existing' }, primary)).toEqual(original);
    expect(await model.collection.findOne({ key: 'missing' }, primary)).toBeNull();
    await model.collection.createIndex({ source: 1 }, { unique: true });
    try {
      await expect(kv.setIfAbsent('other', 'value')).rejects.toMatchObject({
        code: 11000,
        keyPattern: { source: 1 },
      });
      expect(await model.collection.findOne({ key: 'other' }, primary)).toBeNull();
    } finally {
      await model.collection.dropIndex('source_1');
    }
  });

  it.each([false, true])(
    'rejects expiry overflow after contention, missing=%s',
    async (missing) => {
      await kv.set('clock', 'clock');
      if (!missing) await kv.set('held', 'original');
      const original = await model.collection.findOne({ key: 'held' }, primary);
      const [clock] = await model.collection
        .aggregate(
          [{ $match: { key: 'clock' } }, { $project: { now: { $toLong: '$$NOW' } } }],
          primary,
        )
        .toArray();
      const ttl = 8_640_000_000_000_000 - Number(clock.now) - 200;
      await expect(
        block({
          key: 'held',
          missing,
          run: async () => {
            if (missing) return kv.setIfAbsent('held', 'replacement', { ttl });
            await kv.set('held', 'replacement', { ttl });
            return true;
          },
        }),
      ).rejects.toThrow(RangeError);
      expect(await model.collection.findOne({ key: 'held' }, primary)).toEqual(original);
    },
  );

  it('does not silently supply an ID when the model generates null', async () => {
    const custom = first.model(
      'null-id',
      new mongoose.Schema({
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true, default: () => null },
        key: { type: String, unique: true },
        data: mongoose.Schema.Types.Mixed,
        expiresAt: Date,
      }),
    );
    await expect(store(custom).set('key', 'value', { ttl: 1000 })).rejects.toThrow(
      'did not generate a valid ObjectId',
    );
    expect(await custom.collection.countDocuments({}, primary)).toBe(0);
  });

  it('preserves legacy expiry and exact ownership on aborted transactions', async () => {
    await model.collection.insertMany([
      { key: 'missing', data: 'owner' },
      { key: 'null', data: 'owner', expiresAt: null },
    ]);
    for (const key of ['missing', 'null']) {
      const original = await model.collection.findOne({ key }, primary);
      expect(await kv.extendLock({ key, token: 'owner' }, 1000)).toBe(false);
      expect(await kv.releaseLock({ key, token: 'owner' })).toBe(false);
      expect(await kv.setIfAbsent(key, 'new')).toBe(false);
      expect(await peer.get(key)).toBe('owner');
      expect(await model.collection.findOne({ key }, primary)).toEqual(original);
    }
    for (const value of ['Owner', ['owner'], { token: 'owner' }]) {
      await kv.set('typed', value, { ttl: 60_000 });
      const original = await model.collection.findOne({ key: 'typed' }, primary);
      expect(await kv.extendLock({ key: 'typed', token: 'owner' }, 1000)).toBe(false);
      expect(await kv.releaseLock({ key: 'typed', token: 'owner' })).toBe(false);
      expect(await model.collection.findOne({ key: 'typed' }, primary)).toEqual(original);
    }
  });
});
