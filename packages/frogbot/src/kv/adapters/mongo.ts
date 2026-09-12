import type { BaseDatabaseAdapter, KVStoreValue, PayloadRequest } from 'payload';

import { KVUnsupportedError } from '../errors.js';
import type { KVDatabaseAdapter, KVLock } from '../types.js';
import { kvAtomic } from '../types.js';
import { validateKVTTL } from '../validateTTL.js';

type MongoExpression = Record<string, unknown>;
type MongoCursor<T> = { toArray(): Promise<T[]> };
type MongoOptions = {
  collation?: { locale: 'simple' };
  includeResultMetadata?: false;
  projection?: Record<string, number>;
  readPreference: 'primary';
  returnDocument?: 'before';
  session?: MongoSession;
  writeConcern?: { w: 'majority' };
};
type MongoSession = {
  abortTransaction(): Promise<void>;
  endSession(): Promise<void>;
  withTransaction<T>(
    callback: () => Promise<T>,
    options: {
      readConcern: { level: 'snapshot' };
      readPreference: 'primary';
      writeConcern: { w: 'majority' };
    },
  ): Promise<T>;
};
type MongoKVDocument = { _id: unknown; data: KVStoreValue; expiresAt?: Date | null; key: string };
type MongoKVCollection = {
  deleteMany(filter: MongoExpression, options: MongoOptions): Promise<{ deletedCount: number }>;
  deleteOne(filter: MongoExpression, options: MongoOptions): Promise<{ deletedCount: number }>;
  find(filter: MongoExpression, options: MongoOptions): MongoCursor<MongoKVDocument>;
  findOne(filter: MongoExpression, options: MongoOptions): Promise<MongoKVDocument | null>;
  findOneAndUpdate(
    filter: MongoExpression,
    update: MongoExpression[],
    options: MongoOptions,
  ): Promise<MongoKVDocument | null>;
  insertOne(
    doc: MongoExpression,
    options: Pick<MongoOptions, 'readPreference' | 'session'>,
  ): Promise<unknown>;
  listIndexes(options: MongoOptions): MongoCursor<{
    collation?: { locale?: string };
    key: Record<string, unknown>;
    partialFilterExpression?: MongoExpression;
    unique?: boolean;
  }>;
  updateOne(
    filter: MongoExpression,
    update: MongoExpression[],
    options: MongoOptions,
  ): Promise<{ matchedCount: number }>;
};
type MongoTimestamps =
  | boolean
  | {
      createdAt?: boolean | string;
      currentTime?: unknown;
      updatedAt?: boolean | string;
    };
type MongoKVModel = {
  new (data: MongoExpression): {
    toObject(options: MongoExpression): MongoExpression;
    validateSync(): Error | undefined;
  };
  collection: MongoKVCollection;
  db: {
    db: {
      command(command: MongoExpression, options: MongoOptions): Promise<MongoExpression>;
    };
    startSession(): Promise<MongoSession>;
  };
  init(): Promise<unknown>;
  schema: {
    options: { timestamps?: MongoTimestamps; versionKey?: false | string };
    path(name: string): { instance: string; options: { auto?: boolean } } | undefined;
  };
};
type MongoKVCreateArgs = { adapter: BaseDatabaseAdapter; collectionSlug: string };
type MongoMutation = {
  data?: KVStoreValue;
  key: string;
  operation: 'set' | 'claim' | 'extend' | 'release';
  token?: string;
  ttl?: number;
};

const maxDate = 8_640_000_000_000_000;
const overflowMarker = 'frogbot.kv.expiry-overflow';
const req = {} as PayloadRequest;
const readOptions: MongoOptions = { collation: { locale: 'simple' }, readPreference: 'primary' };
const writeOptions: MongoOptions = { ...readOptions, writeConcern: { w: 'majority' } };
const finiteExpiry = { $eq: [{ $type: '$expiresAt' }, 'date'] };
const expired = { $and: [finiteExpiry, { $lte: ['$expiresAt', '$$NOW'] }] };
const unexpired = {
  $and: [
    finiteExpiry,
    { $gt: ['$expiresAt', '$$NOW'] },
    { $lte: ['$expiresAt', new Date(maxDate)] },
  ],
};
const live = {
  $or: [{ $eq: [{ $ifNull: ['$expiresAt', null] }, null] }, unexpired],
};

function expiry(ttl?: number): MongoExpression | string {
  if (ttl === undefined) return '$$REMOVE';
  validateKVTTL(ttl);
  return {
    $convert: {
      input: {
        $cond: [
          { $lte: [{ $toLong: '$$NOW' }, maxDate - ttl] },
          { $add: ['$$NOW', ttl] },
          { $literal: overflowMarker },
        ],
      },
      to: 'date',
    },
  };
}

function ownership({ key, token }: KVLock): MongoExpression {
  return {
    key,
    $expr: {
      $and: [
        { $eq: [{ $type: '$data' }, 'string'] },
        { $eq: ['$data', { $literal: token }] },
        unexpired,
      ],
    },
  };
}

function isKeyConflict(error: unknown, key: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, keyPattern, keyValue } = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
  };
  return (
    code === 11000 &&
    !!keyPattern &&
    Object.keys(keyPattern).length === 1 &&
    (keyPattern.key === 1 || keyPattern.key === -1) &&
    !!keyValue &&
    Object.keys(keyValue).length === 1 &&
    keyValue.key === key
  );
}

function timestampField(timestamps: MongoTimestamps | undefined, field: 'createdAt' | 'updatedAt') {
  if (!timestamps) return undefined;
  const option = typeof timestamps === 'object' ? timestamps[field] : true;
  return option === false ? undefined : typeof option === 'string' ? option : field;
}

function unsupported(reason: string): KVUnsupportedError {
  const error = new KVUnsupportedError();
  error.message = reason;
  return error;
}

export function createMongoKV({ adapter, collectionSlug }: MongoKVCreateArgs): KVDatabaseAdapter {
  let ready: Promise<MongoKVModel> | undefined;
  let atomicReady: Promise<MongoKVModel> | undefined;
  const getModel = (): Promise<MongoKVModel> => {
    ready ??= (async () => {
      const model = (adapter as unknown as { collections?: Record<string, MongoKVModel> })
        .collections?.[collectionSlug];
      if (!model) throw new Error(`Mongo KV collection "${collectionSlug}" is not initialized`);
      await model.init();
      return model;
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };

  const getAtomicModel = (): Promise<MongoKVModel> => {
    atomicReady ??= (async () => {
      const model = await getModel();
      const hello = await model.db.db.command({ hello: 1 }, { readPreference: 'primary' });
      if (
        typeof hello.setName !== 'string' ||
        typeof hello.logicalSessionTimeoutMinutes !== 'number'
      ) {
        throw unsupported('Mongo KV requires a replica set with transaction support');
      }
      const id = model.schema.path('_id');
      if (id?.instance !== 'ObjectId' || id.options.auto !== true) {
        throw unsupported(
          'Mongo KV requires automatically generated ObjectId IDs; custom IDs are unsupported',
        );
      }
      const timestamps = model.schema.options.timestamps;
      if (timestamps && typeof timestamps === 'object' && timestamps.currentTime !== undefined) {
        throw unsupported(
          'Mongo KV timestamps must use backend time; custom currentTime is unsupported',
        );
      }
      for (const field of ['createdAt', 'updatedAt'] as const) {
        const name = timestampField(timestamps, field);
        if (name && ['_id', 'key', 'data', 'expiresAt'].includes(name.split('.')[0])) {
          throw unsupported('Mongo KV timestamp fields must not overlap KV fields');
        }
      }
      const indexes = await model.collection.listIndexes({ readPreference: 'primary' }).toArray();
      if (
        !indexes.some(
          (index) =>
            index.unique &&
            Object.keys(index.key).length === 1 &&
            (index.key.key === 1 || index.key.key === -1) &&
            !index.partialFilterExpression &&
            (!index.collation || index.collation.locale === 'simple'),
        )
      ) {
        throw unsupported(
          'Mongo KV requires a unique, non-partial key index with simple collation',
        );
      }
      return model;
    })().catch((error) => {
      atomicReady = undefined;
      throw error;
    });
    return atomicReady;
  };

  const collection = async () => (await getModel()).collection;

  const mutate = async ({ key, operation, data, token, ttl }: MongoMutation): Promise<boolean> => {
    const expiresAt = expiry(ttl);
    const model = await getAtomicModel();
    const session = await model.db.startSession();
    const options: MongoOptions = { ...readOptions, session };
    try {
      for (let attempt = 0; ; attempt++) {
        let inserting = false;
        try {
          return await session.withTransaction(
            async () => {
              inserting = false;
              const previous = await model.collection.findOneAndUpdate(
                { key },
                [
                  {
                    $set: {
                      expiresAt: {
                        $cond: [{ $eq: ['$expiresAt', new Date(0)] }, new Date(1), new Date(0)],
                      },
                    },
                  },
                ],
                {
                  ...options,
                  includeResultMetadata: false,
                  returnDocument: 'before',
                  projection: { _id: 1, expiresAt: 1 },
                },
              );
              if (previous) {
                if (
                  previous.expiresAt instanceof Date &&
                  !Number.isFinite(previous.expiresAt.getTime())
                ) {
                  throw new RangeError(
                    'Mongo KV contains an expiration outside the supported date range',
                  );
                }
                await model.collection.updateOne(
                  { _id: previous._id },
                  [
                    {
                      $set: {
                        expiresAt:
                          previous.expiresAt === undefined
                            ? '$$REMOVE'
                            : { $literal: previous.expiresAt },
                      },
                    },
                  ],
                  options,
                );
              } else if (operation === 'set' || operation === 'claim') {
                const doc = new model({ key, data });
                const error = doc.validateSync();
                if (error) throw error;
                const initial = doc.toObject({
                  depopulate: true,
                  flattenMaps: true,
                  getters: false,
                  virtuals: false,
                  transform: false,
                });
                const id = initial._id as { _bsontype?: string } | undefined;
                if (id?._bsontype !== 'ObjectId') {
                  throw unsupported('Mongo KV model did not generate a valid ObjectId ID');
                }
                const versionKey = model.schema.options.versionKey;
                if (versionKey && initial[versionKey] === undefined) initial[versionKey] = 0;
                inserting = true;
                await model.collection.insertOne(initial, { readPreference: 'primary', session });
                inserting = false;
              } else {
                await session.abortTransaction();
                return false;
              }

              let filter: MongoExpression = { key };
              if (operation === 'extend' || operation === 'release') {
                filter = ownership({ key, token: token! });
              } else if (operation === 'claim' && previous) {
                filter = { key, $expr: expired };
              }
              let changed: boolean;
              if (operation === 'release') {
                changed = (await model.collection.deleteOne(filter, options)).deletedCount === 1;
              } else {
                const fields: MongoExpression = { expiresAt };
                if (operation !== 'extend') fields.data = { $literal: data };
                const timestamps = model.schema.options.timestamps;
                const createdAt = timestampField(timestamps, 'createdAt');
                const updatedAt = timestampField(timestamps, 'updatedAt');
                if (!previous && createdAt) fields[createdAt] = '$$NOW';
                if (updatedAt) fields[updatedAt] = '$$NOW';
                const result = await model.collection.updateOne(
                  filter,
                  [{ $set: fields }],
                  options,
                );
                changed = result.matchedCount === 1;
              }
              if (!changed) await session.abortTransaction();
              return changed;
            },
            {
              readPreference: 'primary',
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority' },
            },
          );
        } catch (error) {
          if (inserting && isKeyConflict(error, key) && attempt < 2) continue;
          throw error;
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 241 &&
        error.message.includes(overflowMarker)
      ) {
        throw new RangeError('KV ttl exceeds the supported expiration range', { cause: error });
      }
      throw error;
    } finally {
      await session.endSession();
    }
  };

  return {
    [kvAtomic]: true,
    async clear() {
      await (await collection()).deleteMany({}, writeOptions);
    },
    async cleanup() {
      await (await collection()).deleteMany({ $expr: expired }, writeOptions);
    },
    async delete(key) {
      await (await collection()).deleteOne({ key }, writeOptions);
    },
    async get<T extends KVStoreValue>(key: string): Promise<T | null> {
      const doc = await (
        await collection()
      ).findOne({ key, $expr: live }, { ...readOptions, projection: { _id: 0, data: 1 } });
      return doc ? (doc.data as T) : null;
    },
    async has(key) {
      return (
        (await (
          await collection()
        ).findOne({ key, $expr: live }, { ...readOptions, projection: { _id: 1 } })) !== null
      );
    },
    async keys() {
      const docs = await (
        await collection()
      )
        .find({ $expr: live }, { ...readOptions, projection: { _id: 0, key: 1 } })
        .toArray();
      return docs.map(({ key }) => key);
    },
    async set(key, data, options) {
      if (options?.ttl === undefined) {
        await adapter.upsert({
          collection: collectionSlug,
          data: { key, data, expiresAt: null },
          joins: false,
          req,
          select: {},
          where: { key: { equals: key } },
        });
        return;
      }
      await mutate({ key, data, ttl: options?.ttl, operation: 'set' });
    },
    async setIfAbsent(key, data, options) {
      return mutate({ key, data, ttl: options?.ttl, operation: 'claim' });
    },
    async extendLock(lock, ttl) {
      validateKVTTL(ttl);
      return mutate({ ...lock, ttl, operation: 'extend' });
    },
    async releaseLock(lock) {
      return mutate({ ...lock, operation: 'release' });
    },
  };
}
