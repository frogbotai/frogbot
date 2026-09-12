import type { BaseDatabaseAdapter } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { createMongoKV } from '../../../../packages/frogbot/src/kv/adapters/mongo.js';
import { KVUnsupportedError } from '../../../../packages/frogbot/src/kv/errors.js';
import { kvAtomic } from '../../../../packages/frogbot/src/kv/types.js';

function fixture() {
  const native = {
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    find: vi.fn().mockReturnValue({ toArray: async () => [] }),
    findOne: vi.fn().mockResolvedValue(null),
    findOneAndUpdate: vi.fn().mockResolvedValue({ _id: 'existing', expiresAt: null }),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'generated' }),
    listIndexes: vi.fn().mockReturnValue({
      toArray: async () => [{ key: { key: 1 }, unique: true }],
    }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 0 }),
  };
  const session = {
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    withTransaction: vi.fn(async (callback: () => Promise<unknown>) => callback()),
  };
  class Document {
    constructor(private readonly data: Record<string, unknown>) {}
    toObject() {
      return { _id: { _bsontype: 'ObjectId' }, ...this.data };
    }
    validateSync() {
      return undefined;
    }
  }
  const model = Object.assign(Document, {
    collection: native,
    init: vi.fn().mockResolvedValue(undefined),
    db: {
      db: {
        command: vi.fn().mockResolvedValue({ setName: 'rs0', logicalSessionTimeoutMinutes: 30 }),
      },
      startSession: vi.fn().mockResolvedValue(session),
    },
    schema: {
      options: { timestamps: true, versionKey: '__v' },
      path: vi.fn().mockReturnValue({ instance: 'ObjectId', options: { auto: true } }),
    },
  });
  const upsert = vi.fn().mockResolvedValue({});
  const adapter = { collections: { customKV: model }, upsert } as unknown as BaseDatabaseAdapter;
  return {
    kv: createMongoKV({ adapter, collectionSlug: 'customKV' }),
    model,
    native,
    session,
    upsert,
  };
}

describe('Mongo KV', () => {
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid TTL %s before accessing the database',
    async (ttl) => {
      const { kv, model, native } = fixture();
      await expect(kv.set('key', 'value', { ttl })).rejects.toThrow(RangeError);
      await expect(kv.setIfAbsent('key', 'value', { ttl })).rejects.toThrow(RangeError);
      await expect(kv.extendLock({ key: 'key', token: 'value' }, ttl)).rejects.toThrow(RangeError);
      expect(model.init).not.toHaveBeenCalled();
      expect(native.updateOne).not.toHaveBeenCalled();
    },
  );

  it('uses the configured model and explicitly routes every read to primary', async () => {
    const { kv, model, native } = fixture();
    expect(kv[kvAtomic]).toBe(true);
    await kv.get('key');
    await kv.has('key');
    await kv.keys();
    expect(model.init).toHaveBeenCalledOnce();
    expect(native.listIndexes).not.toHaveBeenCalled();
    expect(model.db.db.command).not.toHaveBeenCalled();
    for (const [, options] of [...native.findOne.mock.calls, ...native.find.mock.calls]) {
      expect(options).toMatchObject({
        collation: { locale: 'simple' },
        readPreference: 'primary',
      });
    }
  });

  it.each(
    [
      [],
      [{ key: { key: 1 } }],
      [{ key: { key: 1, other: 1 }, unique: true }],
      [{ key: { key: 1 }, unique: true, partialFilterExpression: { data: 'token' } }],
      [{ key: { key: 1 }, unique: true, collation: { locale: 'en' } }],
    ].map((indexes) => ({ indexes })),
  )('refuses unsafe key indexes: %j', async ({ indexes }) => {
    const { kv, native } = fixture();
    native.listIndexes.mockReturnValue({ toArray: async () => indexes });
    await expect(kv.setIfAbsent('key', 'value')).rejects.toThrow('unique, non-partial key index');
    expect(native.updateOne).not.toHaveBeenCalled();
  });

  it('retries a same-key insertion conflict in a new transaction before deciding contention', async () => {
    const { kv, native, session } = fixture();
    native.findOneAndUpdate.mockResolvedValueOnce(null);
    native.insertOne.mockRejectedValueOnce({
      code: 11000,
      keyPattern: { key: 1 },
      keyValue: { key: 'key' },
    });
    await expect(kv.setIfAbsent('key', 'value')).resolves.toBe(false);
    expect(session.withTransaction).toHaveBeenCalledTimes(2);
    expect(native.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(session.abortTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    new Error('connection lost'),
    { code: 11000 },
    { code: 11000, keyPattern: { other: 1 }, keyValue: { other: 'key' } },
    { code: 11000, keyPattern: { key: 1 }, keyValue: { key: 'another-key' } },
    { code: 11000, keyPattern: { key: 1, other: 1 }, keyValue: { key: 'key', other: 'value' } },
  ])('preserves unrelated insertion failures: %j', async (error) => {
    const { kv, native, session } = fixture();
    native.findOneAndUpdate.mockResolvedValueOnce(null);
    native.insertOne.mockRejectedValueOnce(error);
    await expect(kv.setIfAbsent('key', 'value')).rejects.toBe(error);
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('preserves unrelated conversion errors', async () => {
    const { kv, native } = fixture();
    const error = Object.assign(new Error('unrelated conversion failure'), { code: 241 });
    native.updateOne.mockRejectedValueOnce(error);
    await expect(kv.set('key', 'value', { ttl: 1000 })).rejects.toBe(error);
  });

  it('reports a renewal match even if no bytes changed', async () => {
    const { kv, native } = fixture();
    native.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 0 });
    await expect(kv.extendLock({ key: 'key', token: 'value' }, 1000)).resolves.toBe(true);
    expect(native.findOne).not.toHaveBeenCalled();
  });

  it('propagates ownership and cleanup failures', async () => {
    const { kv, native } = fixture();
    const error = new Error('write failed');
    native.updateOne.mockRejectedValueOnce(error);
    native.deleteOne.mockRejectedValue(error);
    native.deleteMany.mockRejectedValue(error);
    await expect(kv.extendLock({ key: 'key', token: 'value' }, 1000)).rejects.toBe(error);
    await expect(kv.releaseLock({ key: 'key', token: 'value' })).rejects.toBe(error);
    await expect(kv.cleanup()).rejects.toBe(error);
  });

  it.each([{}, { msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30 }, { setName: 'rs0' }])(
    'explicitly rejects unsupported topology %j',
    async (hello) => {
      const { kv, model, native } = fixture();
      model.db.db.command.mockResolvedValue(hello);
      await expect(kv.set('key', 'value', { ttl: 1000 })).rejects.toMatchObject({
        name: 'KVUnsupportedError',
        message: expect.stringContaining('replica set with transaction support'),
      });
      await expect(kv.setIfAbsent('key', 'value')).rejects.toBeInstanceOf(KVUnsupportedError);
      await expect(kv.extendLock({ key: 'key', token: 'owner' }, 1000)).rejects.toBeInstanceOf(
        KVUnsupportedError,
      );
      await expect(kv.releaseLock({ key: 'key', token: 'owner' })).rejects.toBeInstanceOf(
        KVUnsupportedError,
      );
      expect(model.db.startSession).not.toHaveBeenCalled();
      expect(native.findOneAndUpdate).not.toHaveBeenCalled();
    },
  );

  it.each(['Number', 'String', 'BigInt'])('rejects %s IDs before mutation', async (instance) => {
    const { kv, model, native } = fixture();
    model.schema.path.mockReturnValue({ instance, options: {} });
    await expect(kv.set('key', 'value', { ttl: 1000 })).rejects.toMatchObject({
      name: 'KVUnsupportedError',
      message: expect.stringContaining('custom IDs are unsupported'),
    });
    await expect(kv.setIfAbsent('key', 'value')).rejects.toBeInstanceOf(KVUnsupportedError);
    await expect(kv.extendLock({ key: 'key', token: 'owner' }, 1000)).rejects.toBeInstanceOf(
      KVUnsupportedError,
    );
    await expect(kv.releaseLock({ key: 'key', token: 'owner' })).rejects.toBeInstanceOf(
      KVUnsupportedError,
    );
    expect(native.insertOne).not.toHaveBeenCalled();
    expect(native.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not retry same-key failures outside insertion', async () => {
    const { kv, native, session } = fixture();
    const error = { code: 11000, keyPattern: { key: 1 }, keyValue: { key: 'key' } };
    native.findOneAndUpdate.mockRejectedValueOnce(error);
    await expect(kv.setIfAbsent('key', 'value')).rejects.toBe(error);
    expect(session.withTransaction).toHaveBeenCalledOnce();
  });

  it('bounds duplicate-key retries and preserves the final error', async () => {
    const { kv, native, session } = fixture();
    const error = { code: 11000, keyPattern: { key: 1 }, keyValue: { key: 'key' } };
    native.findOneAndUpdate.mockResolvedValue(null);
    native.insertOne.mockRejectedValue(error);
    await expect(kv.setIfAbsent('key', 'value')).rejects.toBe(error);
    expect(session.withTransaction).toHaveBeenCalledTimes(3);
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('aborts unsuccessful conditional mutations and scopes every write to the transaction', async () => {
    const { kv, native, session } = fixture();
    await expect(kv.extendLock({ key: 'key', token: 'owner' }, 1000)).resolves.toBe(false);
    expect(session.abortTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
    expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      readPreference: 'primary',
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
    for (const [, , options] of [
      ...native.findOneAndUpdate.mock.calls,
      ...native.updateOne.mock.calls,
    ]) {
      expect(options).toMatchObject({ session, readPreference: 'primary' });
      expect(options).not.toHaveProperty('writeConcern');
    }
  });

  it('rejects a custom timestamp clock before mutation', async () => {
    const { kv, model, native } = fixture();
    Object.assign(model.schema.options, { timestamps: { currentTime: () => 0 } });
    await expect(kv.set('key', 'value', { ttl: 1000 })).rejects.toThrow(
      'custom currentTime is unsupported',
    );
    expect(native.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(['standalone', 'custom ID', 'missing unique index'])(
    'preserves basic storage and cleanup with %s',
    async (configuration) => {
      const { kv, model, native, upsert } = fixture();
      if (configuration === 'standalone') model.db.db.command.mockResolvedValue({});
      if (configuration === 'custom ID') {
        model.schema.path.mockReturnValue({ instance: 'Number', options: {} });
      }
      if (configuration === 'missing unique index') {
        native.listIndexes.mockReturnValue({ toArray: async () => [] });
      }
      native.findOne.mockResolvedValue({ key: 'key', data: 'value' });
      native.find.mockReturnValue({ toArray: async () => [{ key: 'key' }] });
      await expect(kv.set('key', 'value')).resolves.toBeUndefined();
      expect(upsert).toHaveBeenCalledWith({
        collection: 'customKV',
        data: { key: 'key', data: 'value', expiresAt: null },
        joins: false,
        req: {},
        select: {},
        where: { key: { equals: 'key' } },
      });
      await expect(kv.get('key')).resolves.toBe('value');
      await expect(kv.has('key')).resolves.toBe(true);
      await expect(kv.keys()).resolves.toEqual(['key']);
      await expect(kv.delete('key')).resolves.toBeUndefined();
      await expect(kv.clear()).resolves.toBeUndefined();
      await expect(kv.cleanup()).resolves.toBeUndefined();
      expect(model.db.db.command).not.toHaveBeenCalled();
      expect(model.schema.path).not.toHaveBeenCalled();
      expect(native.listIndexes).not.toHaveBeenCalled();
      expect(model.db.startSession).not.toHaveBeenCalled();
      for (const [filter, options] of [...native.findOne.mock.calls, ...native.find.mock.calls]) {
        expect(filter).toHaveProperty('$expr');
        expect(options).toMatchObject({ readPreference: 'primary' });
      }
      expect(native.deleteMany).toHaveBeenLastCalledWith(
        { $expr: expect.any(Object) },
        expect.objectContaining({ readPreference: 'primary' }),
      );
      await expect(kv.setIfAbsent('key', 'intruder')).rejects.toBeInstanceOf(KVUnsupportedError);
      expect(native.findOneAndUpdate).not.toHaveBeenCalled();
      expect(native.insertOne).not.toHaveBeenCalled();
      expect(native.updateOne).not.toHaveBeenCalled();
      await expect(kv.get('key')).resolves.toBe('value');
      await expect(kv.set('key', 'replacement', {})).resolves.toBeUndefined();
      expect(upsert).toHaveBeenCalledTimes(2);
    },
  );

  it('recovers from a transient capability-check failure without poisoning basic or extended calls', async () => {
    const { kv, model, native, upsert } = fixture();
    const error = new Error('connection reset');
    model.db.db.command.mockRejectedValueOnce(error);
    native.updateOne.mockResolvedValue({ matchedCount: 1 });
    await expect(kv.setIfAbsent('key', 'value')).rejects.toBe(error);
    expect(native.findOneAndUpdate).not.toHaveBeenCalled();
    await expect(kv.get('key')).resolves.toBeNull();
    await kv.set('key', 'basic');
    expect(upsert).toHaveBeenCalledOnce();
    await expect(kv.setIfAbsent('key', 'value')).resolves.toBe(true);
    expect(model.db.db.command).toHaveBeenCalledTimes(2);
    expect(model.db.db.command).toHaveBeenLastCalledWith(
      { hello: 1 },
      { readPreference: 'primary' },
    );
    expect(native.listIndexes).toHaveBeenCalledWith({ readPreference: 'primary' });
    await expect(kv.extendLock({ key: 'key', token: 'value' }, 1000)).resolves.toBe(true);
    expect(model.db.db.command).toHaveBeenCalledTimes(2);
  });

  it('retries basic model initialization after a transient failure', async () => {
    const { kv, model } = fixture();
    const error = new Error('initialization interrupted');
    model.init.mockRejectedValueOnce(error);
    await expect(kv.get('key')).rejects.toBe(error);
    await expect(kv.get('key')).resolves.toBeNull();
    expect(model.init).toHaveBeenCalledTimes(2);
  });

  it('preserves plain-upsert failures without falling back to native writes', async () => {
    const { kv, native, upsert, model } = fixture();
    const error = new Error('upsert failed');
    upsert.mockRejectedValueOnce(error);
    await expect(kv.set('key', 'value')).rejects.toBe(error);
    expect(native.updateOne).not.toHaveBeenCalled();
    expect(model.db.startSession).not.toHaveBeenCalled();
  });
});
