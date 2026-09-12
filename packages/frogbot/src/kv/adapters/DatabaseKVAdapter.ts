import type { DatabaseKVAdapterOptions, KVAdapterResult, KVStoreValue } from 'payload';
import {
  DatabaseKVAdapter as BaseDatabaseKVAdapter,
  databaseKVAdapter as baseDatabaseKVAdapter,
} from 'payload';

import { KVUnsupportedError } from '../errors.js';
import type { KVDatabaseAdapter, KVLock, KVSetOptions } from '../types.js';
import { kvAtomic } from '../types.js';
import { createMongoKV } from './mongo.js';
import { createSQLKV } from './sql.js';

export const kvDatabase = Symbol.for('frogbot.kv.database');

export type DatabaseKVAdapterResult = KVAdapterResult & { readonly [kvDatabase]: true };

export class DatabaseKVAdapter extends BaseDatabaseKVAdapter implements KVDatabaseAdapter {
  readonly [kvAtomic] = true;
  private native: KVDatabaseAdapter | null | undefined;

  private backend() {
    if (this.native !== undefined) return this.native;
    const adapter = this.payload.db;
    const args = { adapter, collectionSlug: this.collectionSlug };
    if (adapter.name === 'mongoose') {
      this.native = createMongoKV(args);
    } else {
      try {
        this.native = createSQLKV(args);
      } catch (error) {
        if (!(error instanceof KVUnsupportedError)) throw error;
        this.native = null;
      }
    }
    return this.native;
  }

  private atomic() {
    const backend = this.backend();
    if (!backend) throw new KVUnsupportedError();
    return backend;
  }

  async clear() {
    const backend = this.backend();
    return backend ? backend.clear() : super.clear();
  }

  async delete(key: string) {
    const backend = this.backend();
    return backend ? backend.delete(key) : super.delete(key);
  }

  async get<T extends KVStoreValue>(key: string): Promise<T | null> {
    const backend = this.backend();
    return backend ? backend.get<T>(key) : super.get<T>(key);
  }

  async has(key: string) {
    const backend = this.backend();
    return backend ? backend.has(key) : super.has(key);
  }

  async keys() {
    const backend = this.backend();
    return backend ? backend.keys() : super.keys();
  }

  async set(key: string, value: KVStoreValue, options?: KVSetOptions) {
    const backend = this.backend();
    if (backend) return backend.set(key, value, options);
    if (options?.ttl !== undefined) throw new KVUnsupportedError();
    return super.set(key, value);
  }

  async setIfAbsent(key: string, value: KVStoreValue, options?: KVSetOptions) {
    return this.atomic().setIfAbsent(key, value, options);
  }

  async extendLock(lock: KVLock, ttl: number) {
    return this.atomic().extendLock(lock, ttl);
  }

  async releaseLock(lock: KVLock) {
    return this.atomic().releaseLock(lock);
  }

  async cleanup() {
    await this.backend()?.cleanup();
  }
}

export function databaseKVAdapter(options: DatabaseKVAdapterOptions = {}): DatabaseKVAdapterResult {
  const base = baseDatabaseKVAdapter(options);
  const collection = base.kvCollection!;
  const defaults = baseDatabaseKVAdapter().kvCollection!.fields;
  const fields = [
    ...defaults.filter(
      (field) =>
        !collection.fields.some(
          (custom) => 'name' in custom && 'name' in field && custom.name === field.name,
        ),
    ),
    ...collection.fields,
  ];
  for (const [name, type] of [
    ['key', 'text'],
    ['data', 'json'],
  ] as const) {
    const field = fields.find((field) => 'name' in field && field.name === name);
    if (
      !field ||
      field.type !== type ||
      !('required' in field) ||
      !field.required ||
      ('localized' in field && field.localized) ||
      ('virtual' in field && field.virtual) ||
      (name === 'key' && (!('unique' in field) || !field.unique))
    ) {
      throw new Error(
        `KV collection requires a stored ${type} field named "${name}"${name === 'key' ? ' with a unique index' : ''}`,
      );
    }
  }
  const expiry = fields.find((field) => 'name' in field && field.name === 'expiresAt');
  if (
    expiry &&
    (expiry.type !== 'date' ||
      expiry.required ||
      expiry.localized ||
      expiry.virtual ||
      expiry.defaultValue !== undefined)
  ) {
    throw new Error('KV expiresAt must be a nullable, non-localized date field without a default');
  }
  const expiresAt = { ...expiry, name: 'expiresAt', type: 'date' as const, index: true };
  return {
    [kvDatabase]: true,
    kvCollection: {
      ...collection,
      fields: [
        ...fields.filter((field) => !('name' in field) || field.name !== 'expiresAt'),
        expiresAt,
      ],
    },
    init: ({ payload }) => new DatabaseKVAdapter(payload, collection.slug),
  };
}

export type { DatabaseKVAdapterOptions };
