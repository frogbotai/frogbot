import type { FrogBotConfig } from 'frogbot';
import { buildConfig, databaseKVAdapter as rootDatabaseKVAdapter } from 'frogbot';
import type * as PayloadModule from 'payload';
import type { Field, JobsConfig, KVAdapterResult, Payload } from 'payload';
import { databaseKVAdapter as legacyDatabaseKVAdapter } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import {
  DatabaseKVAdapter,
  databaseKVAdapter,
} from '../../../../packages/frogbot/src/kv/adapters/DatabaseKVAdapter.js';
import {
  KV_CLEANUP_TASK_SLUG,
  resolveKVCleanupTask,
} from '../../../../packages/frogbot/src/kv/resolveCleanupTask.js';
import { kvAtomic } from '../../../../packages/frogbot/src/kv/types.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
}));

vi.mock(
  '../../../../packages/frogbot/dist/kv/adapters/DatabaseKVAdapter.js',
  () => import('../../../../packages/frogbot/src/kv/adapters/DatabaseKVAdapter.js'),
);

vi.mock(
  '../../../../packages/frogbot/dist/kv/resolveCleanupTask.js',
  () => import('../../../../packages/frogbot/src/kv/resolveCleanupTask.js'),
);

function makeConfig(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ...overrides,
  };
}

function thirdPartyKV(): KVAdapterResult {
  return {
    init: vi.fn(),
    kvCollection: {
      slug: 'custom-kv',
      fields: [{ name: 'expiresAt', type: 'date' }],
    },
  };
}

function makeJobs(): JobsConfig {
  return {
    autoRun: [{ cron: '*/5 * * * *', queue: 'reports', limit: 7 }],
    tasks: [{ slug: 'send-report', handler: async () => ({ output: {} }) }],
    workflows: [{ slug: 'report-workflow', handler: async () => {} }],
    deleteJobOnComplete: false,
    enableConcurrencyControl: true,
    access: { run: () => true },
  };
}

function cleanupHandler(kv = databaseKVAdapter()) {
  const task = resolveKVCleanupTask({ kv })?.tasks?.find(
    ({ slug }) => slug === KV_CLEANUP_TASK_SLUG,
  );
  if (!task || typeof task.handler !== 'function') throw new Error('Expected a cleanup handler');
  return task.handler;
}

describe('databaseKVAdapter', () => {
  it('is exported from the root and initializes the atomic database adapter', () => {
    expect(rootDatabaseKVAdapter).toBe(databaseKVAdapter);
    const factory = databaseKVAdapter({ kvCollectionOverrides: { slug: 'app-kv' } });
    const payload = { db: { name: 'custom' } } as unknown as Payload;
    const adapter = factory.init({ payload });

    expect(adapter).toBeInstanceOf(DatabaseKVAdapter);
    expect(adapter).toMatchObject({ payload, collectionSlug: 'app-kv', [kvAtomic]: true });
  });

  it('adds one indexed nullable expiration date to the default collection', () => {
    const collection = databaseKVAdapter().kvCollection!;

    expect(collection.fields).toEqual([
      expect.objectContaining({ name: 'key', type: 'text', required: true, unique: true }),
      expect.objectContaining({ name: 'data', type: 'json', required: true }),
      { name: 'expiresAt', type: 'date', index: true },
    ]);
    expect(collection).toMatchObject({ lockDocuments: false, timestamps: false });
  });

  it('preserves custom slug, dbName, fields, hooks and collection options without mutating overrides', () => {
    const field: Field = { name: 'namespace', type: 'text', index: true };
    const hooks = { beforeChange: [vi.fn()] };
    const admin = { hidden: false, useAsTitle: 'namespace' };
    const overrides = {
      slug: 'cache-entries',
      dbName: 'app_cache',
      fields: [field],
      hooks,
      admin,
      timestamps: true,
    };
    const collection = databaseKVAdapter({ kvCollectionOverrides: overrides }).kvCollection!;

    expect(collection).toMatchObject({
      slug: 'cache-entries',
      dbName: 'app_cache',
      timestamps: true,
    });
    expect(collection.admin).toBe(admin);
    expect(collection.hooks).toBe(hooks);
    expect(collection.fields).toEqual([
      expect.objectContaining({ name: 'key', type: 'text', required: true, unique: true }),
      expect.objectContaining({ name: 'data', type: 'json', required: true }),
      field,
      { name: 'expiresAt', type: 'date', index: true },
    ]);
    expect(collection.fields[2]).toBe(field);
    expect(overrides.fields).toEqual([field]);
    expect(collection.fields).not.toBe(overrides.fields);
  });

  it('retains valid custom key and data fields without duplicating the defaults', () => {
    const fields: Field[] = [
      { name: 'key', type: 'text', required: true, unique: true, label: 'Cache key' },
      { name: 'data', type: 'json', required: true, label: 'Cached data' },
    ];
    const collection = databaseKVAdapter({ kvCollectionOverrides: { fields } }).kvCollection!;

    expect(collection.fields).toEqual([
      ...fields,
      { name: 'expiresAt', type: 'date', index: true },
    ]);
    expect(collection.fields[0]).toBe(fields[0]);
    expect(collection.fields[1]).toBe(fields[1]);
  });

  it.each<Field>([
    { name: 'key', type: 'text', required: true, unique: true, label: 'Cache key' },
    { name: 'data', type: 'json', required: true, label: 'Cached data' },
  ])('merges the missing storage default beside a custom $name field', (field) => {
    const fields = databaseKVAdapter({ kvCollectionOverrides: { fields: [field] } }).kvCollection!
      .fields;

    expect(fields).toContain(field);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'key', type: 'text', required: true, unique: true }),
        expect.objectContaining({ name: 'data', type: 'json', required: true }),
        { name: 'expiresAt', type: 'date', index: true },
      ]),
    );
    expect(fields).toHaveLength(3);
  });

  it('preserves valid expiration customizations while enforcing the index', () => {
    const expiry: Field = {
      name: 'expiresAt',
      type: 'date',
      required: false,
      index: false,
      label: 'Expires at',
      admin: { readOnly: true },
      hooks: { beforeValidate: [vi.fn()] },
    };
    const collection = databaseKVAdapter({
      kvCollectionOverrides: { fields: [expiry] },
    }).kvCollection!;

    expect(
      collection.fields.filter((field) => 'name' in field && field.name === 'expiresAt'),
    ).toEqual([{ ...expiry, index: true }]);
    expect(expiry.index).toBe(false);
  });

  it.each<Field>([
    { name: 'expiresAt', type: 'text' },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'expiresAt', type: 'date', localized: true },
    { name: 'expiresAt', type: 'date', virtual: true },
    { name: 'expiresAt', type: 'date', defaultValue: '2026-01-01T00:00:00.000Z' },
    { name: 'expiresAt', type: 'date', defaultValue: () => new Date().toISOString() },
  ])('rejects conflicting expiration field %j', (field) => {
    expect(() => databaseKVAdapter({ kvCollectionOverrides: { fields: [field] } })).toThrow(
      'KV expiresAt must be a nullable, non-localized date field without a default',
    );
  });

  it.each<Field>([
    { name: 'key', type: 'number', required: true, unique: true },
    { name: 'key', type: 'text', required: false, unique: true },
    { name: 'key', type: 'text', required: true, unique: false },
    { name: 'key', type: 'text', required: true, unique: true, localized: true },
    { name: 'key', type: 'text', required: true, unique: true, virtual: true },
    { name: 'data', type: 'text', required: true },
    { name: 'data', type: 'json', required: false },
    { name: 'data', type: 'json', required: true, localized: true },
    { name: 'data', type: 'json', required: true, virtual: true },
  ])('rejects incompatible storage field %j', (field) => {
    expect(() => databaseKVAdapter({ kvCollectionOverrides: { fields: [field] } })).toThrow(
      'KV collection requires a stored',
    );
  });
});

describe('resolveKVCleanupTask', () => {
  it('adds the hourly cleanup task without introducing autoRun', () => {
    const jobs = resolveKVCleanupTask({ kv: databaseKVAdapter() });

    expect(jobs?.tasks).toEqual([
      expect.objectContaining({
        slug: KV_CLEANUP_TASK_SLUG,
        schedule: [{ cron: '0 * * * *', queue: 'default' }],
        handler: expect.any(Function),
      }),
    ]);
    expect(jobs).not.toHaveProperty('autoRun');
  });

  it('preserves existing jobs and autoRun without mutating the caller', () => {
    const jobs = makeJobs();
    const result = resolveKVCleanupTask({ kv: databaseKVAdapter(), jobs });

    expect(result).toEqual({
      ...jobs,
      tasks: [...jobs.tasks!, expect.objectContaining({ slug: KV_CLEANUP_TASK_SLUG })],
    });
    expect(result?.autoRun).toBe(jobs.autoRun);
    expect(result?.workflows).toBe(jobs.workflows);
    expect(result?.access).toBe(jobs.access);
    expect(result?.tasks?.[0]).toBe(jobs.tasks?.[0]);
    expect(result?.tasks).toHaveLength(2);
    expect(jobs.tasks).toHaveLength(1);
  });

  it('preserves a lazy autoRun provider without invoking it', () => {
    const autoRun = vi.fn(async () => [{ cron: '*/5 * * * *', queue: 'reports' }]);
    const result = resolveKVCleanupTask({ kv: databaseKVAdapter(), jobs: { autoRun } });

    expect(result?.autoRun).toBe(autoRun);
    expect(autoRun).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'ordinary third-party adapter', factory: () => ({ init: vi.fn() }) },
    { name: 'third-party kvCollection', factory: thirdPartyKV },
    { name: 'legacy database factory', factory: legacyDatabaseKVAdapter },
  ])('does not add cleanup for $name', ({ factory }) => {
    const kv = factory();
    const jobs = makeJobs();

    expect(resolveKVCleanupTask({ kv })).toBeUndefined();
    expect(resolveKVCleanupTask({ kv, jobs })).toBe(jobs);
  });

  it('rejects a reserved task collision for the known database factory', () => {
    const jobs: JobsConfig = {
      tasks: [{ slug: KV_CLEANUP_TASK_SLUG, handler: async () => ({ output: {} }) }],
    };

    expect(() => resolveKVCleanupTask({ kv: databaseKVAdapter(), jobs })).toThrow(
      `Job task slug '${KV_CLEANUP_TASK_SLUG}' is reserved for KV expiration cleanup`,
    );
    expect(resolveKVCleanupTask({ kv: thirdPartyKV(), jobs })).toBe(jobs);
    expect(jobs.tasks).toHaveLength(1);
  });

  it('awaits database cleanup and returns task output', async () => {
    const adapter = databaseKVAdapter().init({ payload: {} as Payload }) as DatabaseKVAdapter;
    let complete!: () => void;
    const cleanup = vi.spyOn(adapter, 'cleanup').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const handler = cleanupHandler();
    const args = { req: { payload: { kv: adapter } } } as unknown as Parameters<typeof handler>[0];
    let settled = false;
    const result = Promise.resolve(handler(args)).then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith();
    expect(settled).toBe(false);
    complete();
    await expect(result).resolves.toEqual({ output: {} });
  });

  it('propagates cleanup failures', async () => {
    const adapter = databaseKVAdapter().init({ payload: {} as Payload }) as DatabaseKVAdapter;
    const error = new Error('cleanup failed');
    vi.spyOn(adapter, 'cleanup').mockRejectedValue(error);
    const handler = cleanupHandler();

    await expect(
      handler({ req: { payload: { kv: adapter } } } as unknown as Parameters<typeof handler>[0]),
    ).rejects.toBe(error);
  });

  it('rejects a different runtime adapter rather than invoking a third-party cleanup method', async () => {
    const cleanup = vi.fn();
    const handler = cleanupHandler();

    await expect(
      handler({ req: { payload: { kv: { cleanup } } } } as unknown as Parameters<
        typeof handler
      >[0]),
    ).rejects.toThrow('KV cleanup requires the database KV adapter');
    expect(cleanup).not.toHaveBeenCalled();
  });
});

describe('buildConfig KV wiring', () => {
  it('uses the database factory and registers cleanup by default', async () => {
    const config = makeConfig();
    const result = await buildConfig(config);
    const built = await result._internal.payloadConfig;

    expect(built.kv.init({ payload: {} as Payload })).toBeInstanceOf(DatabaseKVAdapter);
    expect(built.kv.kvCollection?.fields).toContainEqual({
      name: 'expiresAt',
      type: 'date',
      index: true,
    });
    expect(built.jobs.tasks?.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(['frogbot-sweep-jobs', KV_CLEANUP_TASK_SLUG]),
    );
    expect(built.jobs.autoRun).toBeUndefined();
    expect(config.kv).toBeUndefined();
    expect(config.jobs).toBeUndefined();
  });

  it('preserves an explicit database factory and existing jobs settings', async () => {
    const kv = databaseKVAdapter({ kvCollectionOverrides: { slug: 'app-kv', dbName: 'app_kv' } });
    const jobs = makeJobs();
    const result = await buildConfig(makeConfig({ kv, jobs }));
    const built = await result._internal.payloadConfig;

    expect(built.kv).toBe(kv);
    expect(built.kv.kvCollection).toMatchObject({ slug: 'app-kv', dbName: 'app_kv' });
    expect(built.jobs.autoRun).toBe(jobs.autoRun);
    expect(built.jobs.workflows).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'report-workflow' })]),
    );
    expect(built.jobs.tasks?.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(['send-report', 'frogbot-sweep-jobs', KV_CLEANUP_TASK_SLUG]),
    );
    expect(jobs.tasks).toHaveLength(1);
  });

  it('preserves a third-party collection adapter without registering database cleanup', async () => {
    const kv = thirdPartyKV();
    const jobs = makeJobs();
    const result = await buildConfig(makeConfig({ kv, jobs }));
    const built = await result._internal.payloadConfig;

    expect(built.kv).toBe(kv);
    expect(built.jobs.autoRun).toBe(jobs.autoRun);
    expect(built.jobs.tasks?.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(['send-report', 'frogbot-sweep-jobs']),
    );
    expect(built.jobs.tasks?.map(({ slug }) => slug)).not.toContain(KV_CLEANUP_TASK_SLUG);
  });

  it('resolves the adapter and jobs after plugins run', async () => {
    const kv = thirdPartyKV();
    const jobs = makeJobs();
    const result = await buildConfig(
      makeConfig({
        plugins: [(config) => ({ ...config, kv, jobs })],
      }),
    );
    const built = await result._internal.payloadConfig;

    expect(built.kv).toBe(kv);
    expect(built.jobs.autoRun).toBe(jobs.autoRun);
    expect(built.jobs.tasks?.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining(['send-report', 'frogbot-sweep-jobs']),
    );
  });

  it('rejects a reserved task collision during configuration', async () => {
    await expect(
      buildConfig(
        makeConfig({
          jobs: { tasks: [{ slug: KV_CLEANUP_TASK_SLUG, handler: async () => ({ output: {} }) }] },
        }),
      ),
    ).rejects.toThrow(`Job task slug '${KV_CLEANUP_TASK_SLUG}' is reserved`);
  });
});
