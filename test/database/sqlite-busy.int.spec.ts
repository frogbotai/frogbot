import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { type SQLiteAdapter, sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotInstance } from 'frogbot';
import { FrogBot, getFrogBotPayload, resetFrogBotCache } from 'frogbot/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';

const notesSlug = 'notes';
const databasePath = fileURLToPath(new URL('./sqlite-busy.db', import.meta.url));
type Note = { id: number; title: string };

function isBusy(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (/SQLITE_BUSY|database is locked/.test(cause.message)) return true;
  }

  return false;
}

type BootOptions = { transactions?: boolean; wal?: boolean };

async function boot({
  transactions = true,
  wal = false,
}: BootOptions = {}): Promise<FrogBotInstance> {
  const config = await buildTestConfig({
    db: sqliteAdapter({
      client: { url: `file:${databasePath}` },
      transactionOptions: transactions ? {} : false,
      wal,
    }),
    collections: [
      { slug: notesSlug, access: openAccess, fields: [{ name: 'title', type: 'text' }] },
    ],
  });

  const environment = {
    PAYLOAD_DROP_DATABASE: process.env.PAYLOAD_DROP_DATABASE,
    PAYLOAD_FORCE_DRIZZLE_PUSH: process.env.PAYLOAD_FORCE_DRIZZLE_PUSH,
  };

  (globalThis as { _payload?: Map<string, unknown> })._payload?.delete('default');
  resetFrogBotCache();
  process.env.PAYLOAD_DROP_DATABASE = 'false';
  process.env.PAYLOAD_FORCE_DRIZZLE_PUSH = 'true';

  return new FrogBot().init({ config }).finally(() => {
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

async function removeDatabase() {
  await Promise.all(
    ['', '-shm', '-wal', '-journal'].map((suffix) =>
      rm(`${databasePath}${suffix}`, { force: true }),
    ),
  );
}

describe.skipIf(getCurrentDatabaseAdapter() !== 'sqlite').each([
  ['rollback journal', false],
  ['WAL', true],
])('SQLite writes after a busy error (%s)', (_, wal) => {
  let frogbot: FrogBotInstance;

  beforeEach(async () => {
    await removeDatabase();
    frogbot = await boot({ wal });
  });

  afterEach(async () => {
    await frogbot.destroy();
    await removeDatabase();
  });

  async function create(
    title: string,
    req?: Awaited<ReturnType<FrogBotInstance['createRequest']>>,
  ) {
    return (await frogbot.create({
      collection: notesSlug,
      data: { title },
      req,
    })) as unknown as Note;
  }

  async function titlesAfterRestart() {
    await frogbot.destroy();
    frogbot = await boot({ wal });

    const { docs } = await frogbot.find({
      collection: notesSlug,
      pagination: false,
      sort: 'title',
    });

    return (docs as unknown as Note[]).map((doc) => doc.title);
  }

  it.each([
    ['a Local API create', () => create('Blocked')],
    [
      'a create on the adapter',
      () => frogbot.db.create({ collection: notesSlug, data: { title: 'Blocked' } }),
    ],
  ])('%s blocked by an open transaction does not lose later writes', async (_, write) => {
    const db = getFrogBotPayload(frogbot).db;
    const removed = await create('Removed');
    const req = await frogbot.createRequest();
    const transactionID = await db.beginTransaction();

    if (transactionID === null) throw new Error('[test] the adapter did not start a transaction');

    req.transactionID = transactionID;

    await create('In transaction', req);
    await expect(write()).rejects.toSatisfy(isBusy);
    await db.commitTransaction(transactionID);

    await create('After, detached');
    await frogbot.db.create({ collection: notesSlug, data: { title: 'After, on the adapter' } });
    await frogbot.delete({ collection: notesSlug, id: removed.id });

    const laterTransaction = await db.beginTransaction();

    if (laterTransaction === null) {
      throw new Error('[test] the adapter did not start a transaction');
    }

    req.transactionID = laterTransaction;

    await create('After, in a transaction', req);
    await db.commitTransaction(laterTransaction);

    expect(await titlesAfterRestart()).toEqual([
      'After, detached',
      'After, in a transaction',
      'After, on the adapter',
      'In transaction',
    ]);
  });

  it('parallel creates that hit a busy error keep every create that reported success', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        create(`Parallel ${String(index).padStart(2, '0')}`),
      ),
    );
    const saved = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value.title] : [],
    );
    const failed = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );

    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every(isBusy)).toBe(true);

    await create('Zz after');

    expect(await titlesAfterRestart()).toEqual([...saved.sort(), 'Zz after']);
  });

  async function begin() {
    const transactionID = await getFrogBotPayload(frogbot).db.beginTransaction();

    if (transactionID === null) throw new Error('[test] the adapter did not start a transaction');

    const req = await frogbot.createRequest();

    req.transactionID = transactionID;

    return { req, transactionID };
  }

  function client() {
    return (frogbot.db as unknown as SQLiteAdapter).client;
  }

  function insert(title: string) {
    return {
      sql: `insert into ${notesSlug} (title, updated_at, created_at) values (?, '2026-01-01', '2026-01-01')`,
      args: [title],
    };
  }

  async function titles() {
    const { docs } = await frogbot.find({
      collection: notesSlug,
      pagination: false,
      sort: 'title',
    });

    return (docs as unknown as Note[]).map((doc) => doc.title);
  }

  it('busy errors on each client method keep later updates and deletes', async () => {
    const db = getFrogBotPayload(frogbot).db;
    const kept = await create('Kept');
    const first = await create('First');
    const second = await create('Second');
    const third = await create('Third');
    const fourth = await create('Fourth');
    const { req, transactionID } = await begin();

    await create('In transaction', req);

    const blocked = [
      () => client().execute(insert('Blocked')),
      () => client().batch([insert('Blocked')], 'write'),
      () => client().batch([insert('Blocked')]),
      () => client().executeMultiple(insert('Blocked').sql.replace('?', "'Blocked'")),
      () => client().migrate([insert('Blocked')]),
      () => client().transaction('write'),
      () => frogbot.update({ collection: notesSlug, id: kept.id, data: { title: 'Blocked' } }),
      () =>
        frogbot.db.updateOne({ collection: notesSlug, id: kept.id, data: { title: 'Blocked' } }),
      () => frogbot.delete({ collection: notesSlug, id: kept.id }),
      () => frogbot.db.deleteMany({ collection: notesSlug, where: { id: { equals: kept.id } } }),
    ];

    for (const write of blocked) await expect(write()).rejects.toSatisfy(isBusy);

    await db.commitTransaction(transactionID);

    await frogbot.update({ collection: notesSlug, id: first.id, data: { title: 'Updated' } });
    await frogbot.db.updateOne({
      collection: notesSlug,
      id: second.id,
      data: { title: 'Updated on the adapter' },
    });
    await frogbot.delete({ collection: notesSlug, id: third.id });
    await frogbot.db.deleteMany({ collection: notesSlug, where: { id: { equals: fourth.id } } });

    const expected = ['In transaction', 'Kept', 'Updated', 'Updated on the adapter'];

    expect(await titles()).toEqual(expected);
    expect(await titlesAfterRestart()).toEqual(expected);
  });

  it('hundreds of busy errors leave no connection holding a lock', async () => {
    const db = getFrogBotPayload(frogbot).db;
    const { req, transactionID } = await begin();

    await create('In transaction', req);

    const results = await Promise.allSettled(
      Array.from({ length: 300 }, (_, index) =>
        index % 2
          ? frogbot.db.create({ collection: notesSlug, data: { title: `Blocked ${index}` } })
          : client().execute(insert(`Blocked ${index}`)),
      ),
    );

    expect(results.every((result) => result.status === 'rejected' && isBusy(result.reason))).toBe(
      true,
    );

    await db.commitTransaction(transactionID);

    const exclusive = await client().transaction('write');

    await exclusive.execute(insert('Exclusive'));
    await exclusive.commit();

    const later = await begin();

    await create('Later transaction', later.req);
    await db.commitTransaction(later.transactionID);
    await create('Detached');

    expect(await titlesAfterRestart()).toEqual([
      'Detached',
      'Exclusive',
      'In transaction',
      'Later transaction',
    ]);
  });

  it('same-tick writes racing a commit after a busy BEGIN keep every success in order', async () => {
    const db = getFrogBotPayload(frogbot).db;
    const { req, transactionID } = await begin();

    await create('In transaction', req);

    const begun = client().transaction('write');
    const writes = Array.from({ length: 40 }, (_, index) =>
      client().execute(insert(`Raced ${String(index).padStart(2, '0')}`)),
    );
    const committed = db.commitTransaction(transactionID);
    const results = await Promise.allSettled(writes);

    await committed;

    const transaction = await begun.catch((error: unknown) => {
      expect(error).toSatisfy(isBusy);

      return null;
    });

    if (transaction) {
      await transaction.execute(insert('Zz begun'));
      await transaction.commit();
    }

    const saved = results.flatMap((result, index) =>
      result.status === 'fulfilled'
        ? [{ title: `Raced ${String(index).padStart(2, '0')}`, row: result.value.lastInsertRowid }]
        : [],
    );
    const rows = saved.map(({ row }) => Number(row));

    expect(results.every((result) => result.status === 'fulfilled' || isBusy(result.reason))).toBe(
      true,
    );
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(await titlesAfterRestart()).toEqual([
      'In transaction',
      ...saved.map(({ title }) => title),
      ...(transaction ? ['Zz begun'] : []),
    ]);
  });

  it('a rollback after a busy error discards only the rolled-back writes', async () => {
    const db = getFrogBotPayload(frogbot).db;

    await create('Before');

    const { req, transactionID } = await begin();

    await create('Rolled back', req);
    await expect(create('Blocked')).rejects.toSatisfy(isBusy);
    await db.rollbackTransaction(transactionID);
    await create('After');

    expect(await titles()).toEqual(['After', 'Before']);
    expect(await titlesAfterRestart()).toEqual(['After', 'Before']);
  });

  it('reads after a busy error see only committed data', async () => {
    const db = getFrogBotPayload(frogbot).db;

    await create('Before');

    const { req, transactionID } = await begin();

    await create('In transaction', req);
    await expect(create('Blocked')).rejects.toSatisfy(isBusy);

    expect(await titles()).toEqual(['Before']);

    await db.commitTransaction(transactionID);

    expect(await titles()).toEqual(['Before', 'In transaction']);
    expect(await frogbot.count({ collection: notesSlug })).toEqual({ totalDocs: 2 });
  });

  it('jobs and KV writes blocked by an open transaction keep later jobs and KV writes', async () => {
    const db = getFrogBotPayload(frogbot).db;
    const { req, transactionID } = await begin();

    await create('In transaction', req);

    const blocked = await Promise.allSettled([
      frogbot.jobs.queue({ task: 'frogbot-cleanup-kv', input: {} }),
      frogbot.kv.set('blocked', 'value'),
      frogbot.kv.acquireLock('blocked-lock', 60_000),
    ]);

    expect(blocked.every((result) => result.status === 'fulfilled' || isBusy(result.reason))).toBe(
      true,
    );

    await db.commitTransaction(transactionID);

    const blockedJob = blocked[0].status === 'fulfilled' ? blocked[0].value : null;
    const job = await frogbot.jobs.queue({ task: 'frogbot-cleanup-kv', input: {} });

    await frogbot.kv.set('after', 'value');

    const lock = await frogbot.kv.acquireLock('after-lock', 60_000);

    expect(lock).not.toBeNull();

    await create('After');
    await frogbot.destroy();
    frogbot = await boot({ wal });

    const payload = getFrogBotPayload(frogbot);

    expect(await payload.findByID({ collection: 'payload-jobs', id: job.id })).toMatchObject({
      id: job.id,
    });

    if (blockedJob) {
      expect(
        await payload.findByID({ collection: 'payload-jobs', id: blockedJob.id }),
      ).toMatchObject({ id: blockedJob.id });
    }

    expect(await frogbot.kv.get('after')).toBe('value');
    expect(await frogbot.kv.get('blocked')).toBe(
      blocked[1].status === 'fulfilled' ? 'value' : null,
    );
    expect(await frogbot.kv.acquireLock('after-lock', 60_000)).toBeNull();
    expect(await titles()).toEqual(['After', 'In transaction']);
  });
});

describe.skipIf(getCurrentDatabaseAdapter() !== 'sqlite')('SQLite without transactions', () => {
  let frogbot: FrogBotInstance;

  beforeEach(async () => {
    await removeDatabase();
    frogbot = await boot({ transactions: false });
  });

  afterEach(async () => {
    await frogbot.destroy();
    await removeDatabase();
  });

  it('parallel creates, updates, and deletes all succeed and persist', async () => {
    const created = (await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        frogbot.create({
          collection: notesSlug,
          data: { title: `Parallel ${String(index).padStart(2, '0')}` },
        }),
      ),
    )) as unknown as Note[];

    await Promise.all(
      created.map((note, index) =>
        index % 2
          ? frogbot.delete({ collection: notesSlug, id: note.id })
          : frogbot.update({
              collection: notesSlug,
              id: note.id,
              data: { title: `${note.title} kept` },
            }),
      ),
    );

    const expected = created.flatMap((note, index) => (index % 2 ? [] : [`${note.title} kept`]));

    await frogbot.destroy();
    frogbot = await boot({ transactions: false });

    const { docs } = await frogbot.find({
      collection: notesSlug,
      pagination: false,
      sort: 'title',
    });

    expect((docs as unknown as Note[]).map((doc) => doc.title)).toEqual(expected);
  });
});
