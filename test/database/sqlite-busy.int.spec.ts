import { rm } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  type MigrateUpArgs,
  sql,
  type SQLiteAdapter,
  sqliteAdapter,
  type SQLiteAdapterArgs,
} from '@frogbotai/db-sqlite';
import { type CollectionConfig, definePiece, type FrogBotInstance } from 'frogbot';
import { FrogBot, getFrogBotPayload, resetFrogBotCache } from 'frogbot/test';
import Database from 'libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';

const notesSlug = 'notes';
const databasePath = fileURLToPath(new URL('./sqlite-busy.db', import.meta.url));
const isSQLite = getCurrentDatabaseAdapter() === 'sqlite';
const lockTimeoutMessage =
  /waited \d+ ms for the write lock.*ran without `req` while a transaction was open.*long transaction held the lock/s;
type Note = { id: number; title: string };
type Request = Awaited<ReturnType<FrogBotInstance['createRequest']>>;

function isBusy(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (/SQLITE_BUSY|database is locked/.test(cause.message)) return true;
  }

  return false;
}

type BootOptions = {
  transactions?: boolean;
  wal?: SQLiteAdapterArgs['wal'];
  busyTimeout?: number;
  writeLockTimeout?: number;
  hooks?: CollectionConfig['hooks'];
  collections?: CollectionConfig[];
  url?: string;
  defaultWal?: boolean;
};

async function boot({
  transactions = true,
  wal = false,
  busyTimeout,
  writeLockTimeout,
  hooks,
  collections = [],
  url = `file:${databasePath}`,
  defaultWal = false,
}: BootOptions = {}): Promise<FrogBotInstance> {
  const config = await buildTestConfig({
    db: sqliteAdapter({
      client: { url },
      transactionOptions: transactions ? {} : false,
      wal: defaultWal ? undefined : wal,
      busyTimeout,
      writeLockTimeout,
    }),
    collections: [
      { slug: notesSlug, access: openAccess, hooks, fields: [{ name: 'title', type: 'text' }] },
      ...collections,
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

function insert(title: string) {
  return {
    sql: `insert into ${notesSlug} (title, updated_at, created_at) values (?, '2026-01-01', '2026-01-01')`,
    args: [title],
  };
}

function useFrogBot(options: BootOptions) {
  const app = { frogbot: undefined as unknown as FrogBotInstance };

  beforeEach(async () => {
    await removeDatabase();
    app.frogbot = await boot(options);
  });

  afterEach(async () => {
    await app.frogbot.destroy();
    await removeDatabase();
  });

  return {
    get frogbot() {
      return app.frogbot;
    },
    client() {
      return (app.frogbot.db as unknown as SQLiteAdapter).client;
    },
    async create(title: string, req?: Request) {
      return (await app.frogbot.create({
        collection: notesSlug,
        data: { title },
        req,
      })) as unknown as Note;
    },
    async begin() {
      const transactionID = await getFrogBotPayload(app.frogbot).db.beginTransaction();

      if (transactionID === null) throw new Error('[test] the adapter did not start a transaction');

      const req = await app.frogbot.createRequest();

      req.transactionID = transactionID;

      return { req, transactionID };
    },
    async commit(transactionID: number | string) {
      await getFrogBotPayload(app.frogbot).db.commitTransaction(transactionID);
    },
    async titles() {
      const { docs } = await app.frogbot.find({
        collection: notesSlug,
        pagination: false,
        sort: 'title',
      });

      return (docs as unknown as Note[]).map((doc) => doc.title);
    },
    async titlesAfterRestart() {
      await app.frogbot.destroy();
      app.frogbot = await boot(options);

      return this.titles();
    },
  };
}

describe.skipIf(!isSQLite).each([
  ['rollback journal', false],
  ['WAL', true],
])('SQLite writes on one client wait their turn (%s)', (_, wal) => {
  const app = useFrogBot({ wal });

  it('parallel creates all succeed and persist', async () => {
    const titles = Array.from(
      { length: 20 },
      (_, index) => `Parallel ${String(index).padStart(2, '0')}`,
    );

    const created = await Promise.all(titles.map((title) => app.create(title)));

    expect(created.map((note) => note.title)).toEqual(titles);
    expect(await app.titlesAfterRestart()).toEqual(titles);
  });

  it('writes without req during an open transaction run after its commit, in order', async () => {
    const { req, transactionID } = await app.begin();

    await app.create('In transaction', req);

    const titles = Array.from(
      { length: 40 },
      (_, index) => `Queued ${String(index).padStart(2, '0')}`,
    );
    const writes = titles.map((title) => app.client().execute(insert(title)));
    const committed = app.commit(transactionID);
    const results = await Promise.all(writes);

    await committed;

    const rows = results.map((result) => Number(result.lastInsertRowid));

    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(await app.titlesAfterRestart()).toEqual(['In transaction', ...titles]);
  });

  it('jobs and KV writes during an open transaction run after its commit and persist', async () => {
    const { req, transactionID } = await app.begin();

    await app.create('In transaction', req);

    const queued = Promise.all([
      app.frogbot.jobs.queue({ task: 'frogbot-cleanup-kv', input: {} }),
      app.frogbot.kv.set('queued', 'value'),
      app.frogbot.kv.acquireLock('queued-lock', 60_000),
    ]);

    await app.commit(transactionID);

    const [job, , lock] = await queued;

    expect(lock).not.toBeNull();

    await app.titlesAfterRestart();

    const payload = getFrogBotPayload(app.frogbot);

    expect(await payload.findByID({ collection: 'payload-jobs', id: job.id })).toMatchObject({
      id: job.id,
    });
    expect(await app.frogbot.kv.get('queued')).toBe('value');
    expect(await app.frogbot.kv.acquireLock('queued-lock', 60_000)).toBeNull();
  });

  it('a read without req during an open transaction returns committed data at once', async () => {
    await app.create('Before');

    const { req, transactionID } = await app.begin();

    await app.create('In transaction', req);

    expect(await app.titles()).toEqual(['Before']);
    expect(await app.frogbot.count({ collection: notesSlug })).toEqual({ totalDocs: 1 });

    await app.commit(transactionID);

    expect(await app.titles()).toEqual(['Before', 'In transaction']);
  });

  it('the connection opened after a transaction has the default busy timeout', async () => {
    const transaction = await app.client().transaction('write');

    await transaction.commit();

    expect((await app.client().execute('PRAGMA busy_timeout')).rows[0]).toMatchObject({
      timeout: 1000,
    });
  });
});

describe.skipIf(!isSQLite)('SQLite write lock timeout', () => {
  const app = useFrogBot({ busyTimeout: 250, writeLockTimeout: 100 });

  it('a write without req during an open transaction fails with a clear error', async () => {
    const { req, transactionID } = await app.begin();

    await app.create('In transaction', req);
    await expect(app.create('Detached')).rejects.toThrow(lockTimeoutMessage);
    await app.commit(transactionID);
    await app.create('After');

    expect(await app.titlesAfterRestart()).toEqual(['After', 'In transaction']);
  });

  it('the connection opened after a transaction keeps a set busyTimeout', async () => {
    const transaction = await app.client().transaction('write');

    await transaction.commit();

    expect((await app.client().execute('PRAGMA busy_timeout')).rows[0]).toMatchObject({
      timeout: 250,
    });
  });
});

describe.skipIf(!isSQLite).each([
  ['rollback journal', false],
  ['WAL', true],
])('SQLite writes after another connection holds the lock (%s)', (_, wal) => {
  const app = useFrogBot({ wal, busyTimeout: 20 });
  let other: Database.Database;

  beforeEach(() => {
    other = new Database(databasePath);
  });

  afterEach(() => {
    other.close();
  });

  function holdLock(title = 'Other') {
    other.exec('BEGIN IMMEDIATE');
    other.prepare(insert(title).sql).run(title);
  }

  it.each([
    ['a Local API create', () => app.create('Blocked')],
    [
      'a create on the adapter',
      () => app.frogbot.db.create({ collection: notesSlug, data: { title: 'Blocked' } }),
    ],
  ])('%s that hits a busy error does not lose later writes', async (_, write) => {
    const removed = await app.create('Removed');

    holdLock();

    await expect(write()).rejects.toSatisfy(isBusy);

    other.exec('COMMIT');

    await app.create('After, detached');
    await app.frogbot.db.create({
      collection: notesSlug,
      data: { title: 'After, on the adapter' },
    });
    await app.frogbot.delete({ collection: notesSlug, id: removed.id });

    const { req, transactionID } = await app.begin();

    await app.create('After, in a transaction', req);
    await app.commit(transactionID);

    expect(await app.titlesAfterRestart()).toEqual([
      'After, detached',
      'After, in a transaction',
      'After, on the adapter',
      'Other',
    ]);
  });

  it('busy errors on each client method keep later updates and deletes', async () => {
    const kept = await app.create('Kept');
    const first = await app.create('First');
    const second = await app.create('Second');
    const third = await app.create('Third');
    const fourth = await app.create('Fourth');
    const { frogbot } = app;

    holdLock();

    const blocked = [
      () => app.client().execute(insert('Blocked')),
      () => app.client().batch([insert('Blocked')], 'write'),
      () => app.client().batch([insert('Blocked')]),
      () => app.client().executeMultiple(insert('Blocked').sql.replace('?', "'Blocked'")),
      () => app.client().migrate([insert('Blocked')]),
      () => app.client().transaction('write'),
      () => frogbot.update({ collection: notesSlug, id: kept.id, data: { title: 'Blocked' } }),
      () =>
        frogbot.db.updateOne({ collection: notesSlug, id: kept.id, data: { title: 'Blocked' } }),
      () => frogbot.delete({ collection: notesSlug, id: kept.id }),
      () => frogbot.db.deleteMany({ collection: notesSlug, where: { id: { equals: kept.id } } }),
    ];

    for (const write of blocked) await expect(write()).rejects.toSatisfy(isBusy);

    other.exec('COMMIT');

    await frogbot.update({ collection: notesSlug, id: first.id, data: { title: 'Updated' } });
    await frogbot.db.updateOne({
      collection: notesSlug,
      id: second.id,
      data: { title: 'Updated on the adapter' },
    });
    await frogbot.delete({ collection: notesSlug, id: third.id });
    await frogbot.db.deleteMany({ collection: notesSlug, where: { id: { equals: fourth.id } } });

    const expected = ['Kept', 'Other', 'Updated', 'Updated on the adapter'];

    expect(await app.titles()).toEqual(expected);
    expect(await app.titlesAfterRestart()).toEqual(expected);
  });

  it('repeated busy errors leave no connection holding a lock', async () => {
    holdLock();

    const results = await Promise.allSettled(
      Array.from({ length: 60 }, (_, index) =>
        index % 2
          ? app.frogbot.db.create({ collection: notesSlug, data: { title: `Blocked ${index}` } })
          : app.client().execute(insert(`Blocked ${index}`)),
      ),
    );

    expect(results.every((result) => result.status === 'rejected' && isBusy(result.reason))).toBe(
      true,
    );

    other.exec('COMMIT');

    const exclusive = await app.client().transaction('write');

    await exclusive.execute(insert('Exclusive'));
    await exclusive.commit();

    const { req, transactionID } = await app.begin();

    await app.create('Later transaction', req);
    await app.commit(transactionID);
    await app.create('Detached');

    expect(await app.titlesAfterRestart()).toEqual([
      'Detached',
      'Exclusive',
      'Later transaction',
      'Other',
    ]);
  });

  it('a rollback after a busy error discards only the rolled-back writes', async () => {
    await app.create('Before');

    holdLock();

    await expect(app.create('Blocked')).rejects.toSatisfy(isBusy);

    other.exec('ROLLBACK');

    const { req, transactionID } = await app.begin();

    await app.create('Rolled back', req);
    await getFrogBotPayload(app.frogbot).db.rollbackTransaction(transactionID);
    await app.create('After');

    expect(await app.titles()).toEqual(['After', 'Before']);
    expect(await app.titlesAfterRestart()).toEqual(['After', 'Before']);
  });

  it('reads after a busy error see only committed data', async () => {
    await app.create('Before');

    holdLock();

    await expect(app.create('Blocked')).rejects.toSatisfy(isBusy);

    expect(await app.titles()).toEqual(['Before']);

    other.exec('COMMIT');

    expect(await app.titles()).toEqual(['Before', 'Other']);
    expect(await app.frogbot.count({ collection: notesSlug })).toEqual({ totalDocs: 2 });
  });
});

describe.skipIf(!isSQLite)('SQLite without transactions', () => {
  const app = useFrogBot({ transactions: false });

  it('parallel creates, updates, and deletes all succeed and persist', async () => {
    const created = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        app.create(`Parallel ${String(index).padStart(2, '0')}`),
      ),
    );

    await Promise.all(
      created.map((note, index) =>
        index % 2
          ? app.frogbot.delete({ collection: notesSlug, id: note.id })
          : app.frogbot.update({
              collection: notesSlug,
              id: note.id,
              data: { title: `${note.title} kept` },
            }),
      ),
    );

    const expected = created.flatMap((note, index) => (index % 2 ? [] : [`${note.title} kept`]));

    expect(await app.titlesAfterRestart()).toEqual(expected);
  });
});

let releaseSlowHook: () => void = () => undefined;
let slowHookEntered: () => void = () => undefined;
let slowHook = Promise.resolve();

function gateSlowHook() {
  const entered = new Promise<void>((resolve) => {
    slowHookEntered = resolve;
  });

  slowHook = new Promise<void>((resolve) => {
    releaseSlowHook = resolve;
  });

  return entered;
}

function sqliteTransaction(adapter: SQLiteAdapter, transactionID: number | string) {
  const { db } = adapter.sessions[transactionID];

  if (!('run' in db)) throw new Error('[test] the session is not a SQLite transaction');

  return db;
}

const edgeHooks: CollectionConfig['hooks'] = {
  beforeChange: [
    async ({ data }) => {
      if (data.title === 'Throw before') throw new Error('[test] before change');

      if (typeof data.title === 'string' && data.title.startsWith('Slow')) {
        slowHookEntered();
        await slowHook;
      }

      return data;
    },
  ],
  afterChange: [
    async ({ doc, req }) => {
      if (doc.title === 'Throw after') throw new Error('[test] after change');

      if (doc.title === 'Orphan') {
        const adapter = getFrogBotPayload(req.frogbot).db as unknown as SQLiteAdapter;

        await sqliteTransaction(adapter, (await req.transactionID)!).run(
          sql`insert into children (parent_id) values (99)`,
        );
      }

      return doc;
    },
  ],
};

const deferredForeignKeys = `
  create table parents (id integer primary key);
  create table children (
    id integer primary key,
    parent_id integer references parents (id) deferrable initially deferred
  );
`;

type App = ReturnType<typeof useFrogBot>;

async function enableDeferredForeignKeys(app: App) {
  await app.client().executeMultiple(deferredForeignKeys);
  await app.client().execute('PRAGMA foreign_keys = ON');
}

async function commitFailsInPayload(app: App) {
  await enableDeferredForeignKeys(app);

  const { transactionID } = await app.begin();
  const adapter = getFrogBotPayload(app.frogbot).db as unknown as SQLiteAdapter;

  await sqliteTransaction(adapter, transactionID).run(
    sql`insert into children (parent_id) values (99)`,
  );

  const commitError = await app.commit(transactionID).then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

  await app.create('After');

  const children = await app.client().execute('select count(*) as n from children');

  return { commitError, titles: await app.titles(), children: Number(children.rows[0].n) };
}

async function commitFailsOnClient(app: App) {
  await enableDeferredForeignKeys(app);

  const transaction = await app.client().transaction('write');

  await transaction.execute('insert into children (parent_id) values (99)');

  const commitError = await transaction.commit().then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

  transaction.close();

  await app.client().execute(insert('After'));

  return { commitError, titles: await app.titles() };
}

const savedAfterFailedCommit = {
  commitError: expect.stringMatching(/FOREIGN KEY/),
  titles: ['After'],
  children: 0,
};
const savedAfterFailedClientCommit = {
  commitError: expect.stringMatching(/FOREIGN KEY/),
  titles: ['After'],
};

describe.skipIf(!isSQLite).each([
  ['rollback journal', false],
  ['WAL', true],
])('SQLite after a failed commit (%s)', (_, wal) => {
  const app = useFrogBot({ wal, busyTimeout: 250, writeLockTimeout: 200, hooks: edgeHooks });

  it('a Payload transaction whose commit fails rejects and leaves later writes saved', async () => {
    expect(await commitFailsInPayload(app)).toEqual(savedAfterFailedCommit);
  });

  it('a client transaction whose commit fails, once closed, leaves later writes saved', async () => {
    expect(await commitFailsOnClient(app)).toEqual(savedAfterFailedClientCommit);
  });

  it('a Local API create whose commit fails rejects instead of resolving unsaved', async () => {
    await enableDeferredForeignKeys(app);

    await expect(app.create('Orphan')).rejects.toThrow(/FOREIGN KEY/);
    await app.create('After');

    expect(await app.titlesAfterRestart()).toEqual(['After']);
  });
});

describe.skipIf(!isSQLite)('SQLite write lock release and classification', () => {
  const app = useFrogBot({ busyTimeout: 250, writeLockTimeout: 200, hooks: edgeHooks });
  let open: number | string | undefined;
  let pending: Promise<unknown>[] = [];

  afterEach(async () => {
    releaseSlowHook();
    await Promise.allSettled(pending);
    pending = [];

    if (open !== undefined) await app.commit(open);

    open = undefined;
  });

  async function beginWithNote() {
    const { req, transactionID } = await app.begin();

    open = transactionID;
    await app.create('In transaction', req);

    return transactionID;
  }

  it.each(['Throw before', 'Throw after'])(
    'a create whose hook throws (%s) releases the lock',
    async (title) => {
      await expect(app.create(title)).rejects.toThrow('[test]');
      await app.create('After');

      expect(await app.titlesAfterRestart()).toEqual(['After']);
    },
  );

  it('a statement that rolls back its own transaction releases the lock', async () => {
    await app
      .client()
      .executeMultiple(
        `create trigger refuse before insert on ${notesSlug} when new.title = 'Refused' begin select raise(rollback, 'refused'); end;`,
      );

    await expect(app.create('Refused')).rejects.toThrow();

    const { req, transactionID } = await app.begin();

    await expect(app.create('Refused', req)).rejects.toThrow();
    await app.commit(transactionID);
    await app.create('After');

    expect(await app.titlesAfterRestart()).toEqual(['After']);
  });

  it('a waiter that times out leaves the queue working for the next write', async () => {
    const transactionID = await beginWithNote();

    await expect(app.create('First')).rejects.toThrow(lockTimeoutMessage);

    const second = app.create('Second');

    open = undefined;
    await app.commit(transactionID);
    await second;

    expect(await app.titlesAfterRestart()).toEqual(['In transaction', 'Second']);
  });

  it.each([
    ['a leading line comment', '  -- note\n  select title from notes'],
    ['a leading block comment', '/* note */SELECT title FROM notes'],
    ['a WITH read', 'with t as (select title from notes) select * from t'],
    [
      'a WITH read naming deleted_at',
      'with t as (select title as deleted_at from notes) select * from t',
    ],
  ])('%s during an open transaction returns at once', async (_, statement) => {
    await beginWithNote();

    await expect(app.client().execute(statement)).resolves.toBeDefined();
  });

  it.each([
    ['a PRAGMA read', 'pragma table_info(notes)'],
    ['a bare PRAGMA read', 'PRAGMA main.journal_mode'],
    ['an EXPLAIN read', 'explain query plan select * from notes'],
    ['a VALUES read', 'values (1)'],
    ['a WITH read naming a column "update"', 'with t as (select 1 as "update") select * from t'],
    [
      'a WITH read over several CTEs with quoted text',
      `with "a" (x) as (select 'insert into x'), b as materialized (select (1)) select * from a, b`,
    ],
  ])('%s during an open transaction returns at once', async (_, statement) => {
    await beginWithNote();

    await expect(app.client().execute(statement)).resolves.toBeDefined();
  });

  it.each([
    ['a PRAGMA setting', 'pragma user_version = 7'],
    ['a PRAGMA call with an argument', 'pragma user_version(7)'],
    ['a PRAGMA that writes', 'pragma wal_checkpoint'],
    ['a WITH … DELETE behind a quoted CTE', `with "x" as (select 1) delete from ${notesSlug}`],
    ['an unclosed quote', "select 'open"],
  ])('%s during an open transaction waits for the lock', async (_, statement) => {
    await beginWithNote();

    await expect(app.client().execute(statement)).rejects.toThrow(lockTimeoutMessage);
  });

  it.each([
    [
      'WITH … INSERT',
      `with v as (select 'Write' as title) insert into ${notesSlug} (title, updated_at, created_at) select title, '2026-01-01', '2026-01-01' from v`,
    ],
    [
      'INSERT … RETURNING after a comment',
      `/* note */ insert into ${notesSlug} (title, updated_at, created_at) values ('Write', '2026-01-01', '2026-01-01') returning id`,
    ],
    [
      'lowercase REPLACE INTO',
      `\n-- note\nreplace into ${notesSlug} (title, updated_at, created_at) values ('Write', '2026-01-01', '2026-01-01')`,
    ],
  ])('%s during an open transaction waits for the commit', async (_, statement) => {
    const transactionID = await beginWithNote();
    const write = app.client().execute(statement);

    open = undefined;
    await app.commit(transactionID);
    await write;

    expect(await app.titlesAfterRestart()).toEqual(['In transaction', 'Write']);
  });

  it('parallel transactions get the lock in the order they asked for it', async () => {
    const order: number[] = [];
    const count = 15;

    await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const { req, transactionID } = await app.begin();

        order.push(index);
        await app.create(`T ${String(index).padStart(2, '0')}`, req);
        await app.commit(transactionID);
      }),
    );

    expect(order).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(await app.titlesAfterRestart()).toHaveLength(count);
  });

  it('a mix of parallel creates, updates, KV, jobs, and raw writes loses nothing', async () => {
    const seeded = await Promise.all(
      Array.from({ length: 10 }, (_, index) => app.create(`Seed ${index}`)),
    );

    await Promise.all([
      ...seeded.map((note) =>
        app.frogbot.update({
          collection: notesSlug,
          id: note.id,
          data: { title: `${note.title} updated` },
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) => app.create(`Created ${index}`)),
      ...Array.from({ length: 10 }, (_, index) => app.frogbot.kv.set(`key-${index}`, index)),
      ...Array.from({ length: 5 }, () =>
        app.frogbot.jobs.queue({ task: 'frogbot-cleanup-kv', input: {} }),
      ),
      ...Array.from({ length: 10 }, (_, index) => app.client().execute(insert(`Raw ${index}`))),
    ]);

    const titles = await app.titlesAfterRestart();
    const payload = getFrogBotPayload(app.frogbot);

    expect(titles.filter((title) => title.endsWith('updated'))).toHaveLength(10);
    expect(titles.filter((title) => title.startsWith('Created'))).toHaveLength(10);
    expect(titles.filter((title) => title.startsWith('Raw'))).toHaveLength(10);
    expect(await app.frogbot.kv.keys()).toEqual(
      expect.arrayContaining(Array.from({ length: 10 }, (_, index) => `key-${index}`)),
    );
    expect((await payload.count({ collection: 'payload-jobs' })).totalDocs).toBe(5);
  });

  it('a write queued behind a slow transaction fails after the timeout, naming both causes', async () => {
    const entered = gateSlowHook();
    const slow = app.create('Slow transaction');

    pending = [slow];
    await entered;
    await expect(app.create('Queued')).rejects.toThrow(lockTimeoutMessage);

    releaseSlowHook();
    await slow;
    await app.create('After');

    expect(await app.titlesAfterRestart()).toEqual(['After', 'Slow transaction']);
  });

  it("a jobs claim that throws leaves Payload's transaction open, so later writes time out", async () => {
    const payload = getFrogBotPayload(app.frogbot);
    const adapter = payload.db as unknown as SQLiteAdapter;
    const { updateJobs } = payload.db;

    payload.db.updateJobs = () => Promise.reject(new Error('[test] claim failed'));

    await app.frogbot.jobs.run({ limit: 1 }).catch(() => undefined);

    payload.db.updateJobs = updateJobs;

    const abandoned = Object.keys(adapter.sessions);

    expect(abandoned).toHaveLength(1);
    await expect(app.create('Blocked')).rejects.toThrow(lockTimeoutMessage);

    for (const id of abandoned) await payload.db.rollbackTransaction(id);

    await app.create('After');

    expect(await app.titlesAfterRestart()).toEqual(['After']);
  });

  it('a KV lock released while another transaction is open is released', async () => {
    await app.frogbot.kv.lock('tester-lock', 60_000, async () => {
      const { transactionID } = await app.begin();

      pending = [setImmediate().then(() => app.commit(transactionID))];
    });

    expect(await app.frogbot.kv.acquireLock('tester-lock', 60_000)).not.toBeNull();
  });
});

const identity = definePiece({
  slug: 'identity',
  label: 'Identity',
  auth: z.object({ accessToken: z.string() }),
  client: ({ auth }: { auth: unknown }) => auth,
  oauth: {
    authorizationUrl: 'https://identity.example.com/authorize',
    tokenUrl: 'https://identity.example.com/token',
    scopes: ['openid', 'email'],
    account: () =>
      Promise.resolve({ id: 'identity', label: 'Identity', email: 'person@example.com' }),
  },
  actions: [],
})({ oauth: { clientId: 'client', clientSecret: 'secret' } });

const membersSlug = 'members';

describe.skipIf(!isSQLite)('SQLite sign-in beside another transaction', () => {
  let background: Promise<unknown> | undefined;

  const app = useFrogBot({
    hooks: edgeHooks,
    collections: [
      {
        slug: membersSlug,
        auth: { signIn: [identity] },
        access: { read: () => true },
        hooks: {
          afterLogin: [
            ({ user }) => {
              background = app.create('Slow note beside the login');

              return user;
            },
          ],
        },
        fields: [],
      },
    ],
  });

  afterEach(async () => {
    releaseSlowHook();
    await background;
  });

  it('a login succeeds while another request holds a transaction', async () => {
    const credentials = { email: 'race@example.com', password: 'test-password' };

    await app.frogbot.create({ collection: membersSlug, data: credentials });

    const entered = gateSlowHook();
    const { kv } = app.frogbot;
    const releaseLock = kv.releaseLock.bind(kv);

    kv.releaseLock = async (lock) => {
      await entered;

      const released = releaseLock(lock);

      releaseSlowHook();

      return released;
    };

    await expect(
      app.frogbot.login({ collection: membersSlug, data: credentials }),
    ).resolves.toHaveProperty('token');
  });
});

function causes(error: unknown): string {
  const messages: string[] = [];

  for (let cause = error; cause instanceof Error; cause = cause.cause) messages.push(cause.message);

  return messages.join('\n');
}

function failure(promise: Promise<unknown>): Promise<string | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

describe.skipIf(!isSQLite)('SQLite failed commits beside other commits (tester round 2)', () => {
  const app = useFrogBot({ busyTimeout: 250, writeLockTimeout: 500, hooks: edgeHooks });

  async function beginOrphan() {
    await enableDeferredForeignKeys(app);

    const { transactionID } = await app.begin();
    const adapter = getFrogBotPayload(app.frogbot).db as unknown as SQLiteAdapter;

    await sqliteTransaction(adapter, transactionID).run(
      sql`insert into children (parent_id) values (99)`,
    );

    return transactionID;
  }

  it('a failed commit rejects even when the next queued transaction commits right after it', async () => {
    const orphan = await beginOrphan();
    const next = (async () => {
      const { req, transactionID } = await app.begin();

      await app.create('Next', req);
      await app.commit(transactionID);
    })();

    const [orphanError, nextError] = await Promise.all([
      failure(app.commit(orphan)),
      failure(next),
    ]);

    expect({ orphanError, nextError }).toEqual({
      orphanError: expect.stringMatching(/FOREIGN KEY/),
      nextError: undefined,
    });
    expect(await app.titlesAfterRestart()).toEqual(['Next']);
  });

  it('a failed commit rejects when commitTransaction runs for an ended transaction beside it', async () => {
    const orphan = await beginOrphan();

    const [orphanError, endedError] = await Promise.all([
      failure(app.commit(orphan)),
      failure(app.commit('ended-transaction')),
    ]);

    expect({ orphanError, endedError }).toEqual({
      orphanError: expect.stringMatching(/FOREIGN KEY/),
      endedError: undefined,
    });
  });

  it('a failed commit rejects when commitTransaction calls land on every turn while it fails', async () => {
    const orphan = await beginOrphan();
    let settled = false;
    const orphanError = failure(app.commit(orphan)).finally(() => {
      settled = true;
    });
    // One call after another, so a call lands between the failed COMMIT and its rethrow
    const ended = (async () => {
      let calls = 0;

      for (; !settled; calls += 1) await app.commit('ended-transaction');

      return calls;
    })();

    expect(await orphanError).toMatch(/FOREIGN KEY/);
    expect(await ended).toBeGreaterThan(1);
  });

  it('a commit that succeeds resolves when a queued client transaction fails its commit right after', async () => {
    await enableDeferredForeignKeys(app);

    const { req, transactionID } = await app.begin();

    await app.create('Saved', req);

    const client = (async () => {
      const transaction = await app.client().transaction('write');

      await transaction.execute('insert into children (parent_id) values (99)');
      await transaction.commit().catch(() => undefined);
      transaction.close();
    })();

    const [savedError] = await Promise.all([failure(app.commit(transactionID)), client]);

    expect(savedError).toBeUndefined();
    expect(await app.titlesAfterRestart()).toEqual(['Saved']);
  });

  it('after a failed commit the lock admits one transaction at a time', async () => {
    const orphan = await beginOrphan();

    await failure(app.commit(orphan));

    const order: string[] = [];

    await Promise.all(
      ['A', 'B', 'C'].map(async (title) => {
        const { req, transactionID } = await app.begin();

        order.push(`begin ${title}`);
        await app.create(title, req);
        await setImmediate();
        order.push(`commit ${title}`);
        await app.commit(transactionID);
      }),
    );

    expect(order).toEqual(['begin A', 'commit A', 'begin B', 'commit B', 'begin C', 'commit C']);
    expect(await app.titlesAfterRestart()).toEqual(['A', 'B', 'C']);
  });

  it('a nested Local API create inside a failing transaction rejects once and saves nothing', async () => {
    await enableDeferredForeignKeys(app);

    const { req, transactionID } = await app.begin();

    await app.create('Orphan', req);

    expect(await failure(app.commit(transactionID))).toMatch(/FOREIGN KEY/);
    await app.create('After');
    expect(await app.titlesAfterRestart()).toEqual(['After']);
  });

  it('a migration commits under the lock while other writes run beside it', async () => {
    const payload = getFrogBotPayload(app.frogbot);

    // push mode records a batch -1 migration, which makes `migrate` prompt
    await payload.delete({ collection: 'payload-migrations', where: { batch: { equals: -1 } } });

    const migrating = payload.db.migrate({
      migrations: [
        {
          name: '20260101_tester_round_2',
          async up(args) {
            const { db, req } = args as MigrateUpArgs;
            const request = await app.frogbot.createRequest();

            request.transactionID = req.transactionID;
            await db.run(
              sql`insert into notes (title, updated_at, created_at) values ('Raw migration', '2026-01-01', '2026-01-01')`,
            );
            await app.create('Migration', request);
          },
          down: () => Promise.resolve(),
        },
      ],
    });
    const beside = Array.from({ length: 5 }, (_, index) => app.create(`Beside ${index}`));

    await Promise.all([migrating, ...beside]);

    expect(await app.titlesAfterRestart()).toEqual([
      'Beside 0',
      'Beside 1',
      'Beside 2',
      'Beside 3',
      'Beside 4',
      'Migration',
      'Raw migration',
    ]);
  });

  it('executeMultiple during an open transaction waits for the commit', async () => {
    const { req, transactionID } = await app.begin();

    await app.create('In transaction', req);

    const script = app.client().executeMultiple(
      `insert into notes (title, updated_at, created_at) values ('Script 1', '2026-01-01', '2026-01-01');
       insert into notes (title, updated_at, created_at) values ('Script 2', '2026-01-01', '2026-01-01');`,
    );

    await app.commit(transactionID);
    await script;

    expect(await app.titlesAfterRestart()).toEqual(['In transaction', 'Script 1', 'Script 2']);
  });

  it('the timeout error states the configured timeout and a wait at least that long', async () => {
    const { req, transactionID } = await app.begin();

    await app.create('In transaction', req);

    const message = await failure(app.create('Late'));

    await app.commit(transactionID);

    expect(message).toMatch(lockTimeoutMessage);
    expect(message).toContain('`writeLockTimeout` is 500 ms');
    expect(Number(/waited (\d+) ms/.exec(message ?? '')?.[1])).toBeGreaterThanOrEqual(500);
  });
});

describe.skipIf(!isSQLite)('SQLite WAL default (tester round 2)', () => {
  let frogbot: FrogBotInstance | undefined;

  beforeEach(removeDatabase);

  afterEach(async () => {
    await frogbot?.destroy();
    frogbot = undefined;
    await removeDatabase();
  });

  async function journalMode(options: BootOptions) {
    await frogbot?.destroy();
    frogbot = await boot(options);

    const { rows } = await (frogbot.db as unknown as SQLiteAdapter).client.execute(
      'pragma journal_mode',
    );

    return rows[0].journal_mode;
  }

  it('a file: database gets WAL by default', async () => {
    expect(await journalMode({ defaultWal: true })).toBe('wal');
  });

  it('file::memory:?cache=shared keeps its own journal mode and still writes', async () => {
    expect(await journalMode({ url: 'file::memory:?cache=shared', defaultWal: true })).toBe(
      'memory',
    );
    await frogbot!.create({ collection: notesSlug, data: { title: 'Memory' } });
    expect((await frogbot!.count({ collection: notesSlug })).totalDocs).toBe(1);
  });

  it('file::memory: keeps its own journal mode', async () => {
    expect(await journalMode({ url: 'file::memory:', defaultWal: true })).toBe('memory');
  });

  it('wal: false on a database that ran with the WAL default returns to the rollback journal', async () => {
    // The WAL run is another process, like a restart: in this process libsql never closes a
    // transaction's connection, and an open connection keeps the file in WAL
    const previous = new Database(databasePath);

    previous.exec('pragma journal_mode = wal');
    previous.exec('pragma user_version = 1');
    previous.close();

    expect(await journalMode({ wal: false })).toBe('delete');
    await frogbot!.create({ collection: notesSlug, data: { title: 'Rollback journal' } });
    expect((await frogbot!.count({ collection: notesSlug })).totalDocs).toBe(1);
  });

  it('wal: false still boots in WAL while another connection reads the file', async () => {
    const open = new Database(databasePath);

    open.exec('pragma journal_mode = wal');
    open.exec('begin');
    open.prepare('select count(*) from sqlite_master').get();

    expect(await journalMode({ wal: false, busyTimeout: 50 })).toBe('wal');
    open.exec('rollback');
    await frogbot!.create({ collection: notesSlug, data: { title: 'Still WAL' } });
    expect((await frogbot!.count({ collection: notesSlug })).totalDocs).toBe(1);
    open.close();
  });

  it('a WAL synchronous and journal size limit still apply after a transaction', async () => {
    frogbot = await boot({ wal: { synchronous: 'NORMAL', journalSizeLimit: 1234 } });

    const client = () => (frogbot!.db as unknown as SQLiteAdapter).client;
    const settings = async () => [
      (await client().execute('pragma synchronous')).rows[0].synchronous,
      (await client().execute('pragma journal_size_limit')).rows[0].journal_size_limit,
    ];
    const before = await settings();

    await frogbot.create({ collection: notesSlug, data: { title: 'Transaction' } });

    expect([before, await settings()]).toEqual([
      [1, 1234],
      [1, 1234],
    ]);
  });

  it('a stale -wal and -shm left by a crashed process do not replay into a fresh database', async () => {
    const crashed = new Database(databasePath);

    crashed.exec('pragma journal_mode = wal');
    crashed.exec('create table stale (id integer primary key, value text)');
    crashed.exec("insert into stale (value) values ('stale')");
    // `notes` from the old run, so a replay would show up as an extra row
    crashed.exec(
      'create table notes (id integer primary key, title text, updated_at text, created_at text)',
    );
    crashed.exec("insert into notes (title, updated_at, created_at) values ('Stale', 'x', 'x')");
    await rm(databasePath, { force: true });

    frogbot = await boot({ defaultWal: true });
    await frogbot.create({ collection: notesSlug, data: { title: 'Fresh' } });

    // the old process's handle goes away (crash, exit, or GC of a leaked connection)
    crashed.close();

    await frogbot.create({ collection: notesSlug, data: { title: 'After close' } });
    await frogbot.destroy();
    frogbot = await boot({ defaultWal: true });

    const client = (frogbot.db as unknown as SQLiteAdapter).client;
    const { docs } = await frogbot.find({
      collection: notesSlug,
      sort: 'title',
      pagination: false,
    });
    const integrity = await client.execute('pragma integrity_check');

    expect({
      titles: docs.map((doc) => (doc as unknown as Note).title),
      integrity: integrity.rows[0].integrity_check,
    }).toEqual({ titles: ['After close', 'Fresh'], integrity: 'ok' });
  });
});

const postsSlug = 'posts';
const postsCollection: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'tags', type: 'array', fields: [{ name: 'name', type: 'text' }] },
    { name: 'related', type: 'relationship', relationTo: notesSlug, hasMany: true },
    { name: 'kind', type: 'select', hasMany: true, options: ['a', 'b'] },
  ],
};

type Statement = string | { sql: string; args?: unknown };

describe.skipIf(!isSQLite)(
  'SQLite read rule on statements Payload and Drizzle emit (tester round 2)',
  () => {
    const app = useFrogBot({
      transactions: false,
      busyTimeout: 250,
      writeLockTimeout: 150,
      collections: [postsCollection],
    });

    async function capture(workload: () => Promise<unknown>) {
      const client = app.client() as unknown as {
        execute: (statement: Statement) => Promise<unknown>;
      };
      const execute = client.execute;
      const seen = new Map<string, Statement>();

      client.execute = (statement) => {
        seen.set(typeof statement === 'string' ? statement : statement.sql, statement);

        return execute(statement);
      };

      try {
        await workload();
      } finally {
        client.execute = execute;
      }

      return [...seen.values()];
    }

    async function classify(statements: Statement[]) {
      const transaction = await app.client().transaction('write');
      const outcomes: Array<{ sql: string; outcome: string }> = [];

      try {
        for (const statement of statements) {
          const outcome = await app
            .client()
            .execute(statement as never)
            .then(
              () => 'read',
              (error: unknown) =>
                error instanceof Error && lockTimeoutMessage.test(error.message)
                  ? 'write'
                  : isBusy(error)
                    ? 'write ran as a read'
                    : `error: ${error instanceof Error ? error.message : String(error)}`,
            );

          outcomes.push({
            sql: typeof statement === 'string' ? statement : statement.sql,
            outcome,
          });
        }
      } finally {
        await transaction.rollback();
        transaction.close();
      }

      return outcomes;
    }

    it('no write statement is classed as a read', async () => {
      const statements = await capture(async () => {
        const notes = await Promise.all([app.create('One'), app.create('Two')]);
        const post = await app.frogbot.create({
          collection: postsSlug,
          data: {
            title: 'Post',
            tags: [{ name: 'x' }, { name: 'y' }],
            related: notes.map((note) => note.id),
            kind: ['a', 'b'],
            _status: 'published',
          },
        });

        await app.frogbot.update({
          collection: postsSlug,
          id: post.id,
          data: { title: 'Draft', tags: [{ name: 'z' }] },
          draft: true,
        });
        await app.frogbot.update({
          collection: postsSlug,
          where: { title: { like: 'Post' } },
          data: { kind: ['b'] },
        });
        await app.frogbot.find({
          collection: postsSlug,
          depth: 2,
          where: { 'tags.name': { equals: 'x' } },
        });
        await app.frogbot.findVersions({ collection: postsSlug });
        await app.frogbot.count({ collection: postsSlug });
        await app.frogbot.findByID({ collection: postsSlug, id: post.id, draft: true });
        await app.frogbot.kv.set('key', { value: 1 }, { ttl: 60_000 });
        await app.frogbot.kv.setIfAbsent('absent', 1);
        await app.frogbot.kv.get('key');
        await app.frogbot.kv.keys();
        await app.frogbot.kv.lock('lock', 60_000, () => Promise.resolve(undefined));
        await app.frogbot.kv.delete('key');
        await app.frogbot.jobs.queue({ task: 'frogbot-cleanup-kv', input: {} });
        await app.frogbot.jobs.run({ limit: 1 });
        await app.frogbot.delete({ collection: postsSlug, where: { id: { exists: true } } });
        await app.frogbot.delete({ collection: notesSlug, id: notes[0].id });
      });

      const outcomes = await classify(statements);

      const writes = outcomes.filter(({ outcome }) => outcome === 'write');
      const reads = outcomes.filter(({ outcome }) => outcome === 'read');

      expect(outcomes.filter(({ outcome }) => outcome !== 'write' && outcome !== 'read')).toEqual(
        [],
      );
      expect(writes.every(({ sql: text }) => !/^\s*select\b/i.test(text))).toBe(true);
      expect(reads.every(({ sql: text }) => /^\s*(select|with|pragma)\b/i.test(text))).toBe(true);
      expect(writes.length).toBeGreaterThan(10);
      expect(reads.length).toBeGreaterThan(5);
    });

    it.each([
      ['a write after a semicolon', `select 1; delete from ${notesSlug}`],
      [
        'an INSERT … SELECT',
        `insert into ${notesSlug} (title, updated_at, created_at) select 'x', 'x', 'x'`,
      ],
      ['a CTE whose name is select', `with "select" as (select 1) delete from ${notesSlug}`],
      [
        'a CTE body with an unbalanced quoted paren',
        `with t as (select ')' as p) delete from ${notesSlug}`,
      ],
      [
        'a SELECT with a comment-hidden DELETE after it',
        `select 1 /* ; */; delete from ${notesSlug}`,
      ],
      ['a PRAGMA with spaces before the =', 'pragma user_version  =  3'],
      ['a schema PRAGMA setting', 'pragma main.user_version = 3'],
      ['ATTACH', "attach database ':memory:' as other"],
      ['VACUUM', 'vacuum'],
      ['ANALYZE', 'analyze'],
      ['REINDEX', 'reindex'],
    ])('%s during an open transaction does not write beside it', async (_, statement) => {
      await app.create('Before');

      const transaction = await app.client().transaction('write');
      const message = await failure(app.client().execute(statement));

      await transaction.rollback();
      transaction.close();

      expect(isBusy(message === undefined ? undefined : new Error(message))).toBe(false);
      expect(await app.titles()).toEqual(['Before']);
    });
  },
);

let hookFrogBot: FrogBotInstance | undefined;
const credentials = { email: 'round2@example.com', password: 'test-password' };

describe.skipIf(!isSQLite)(
  'SQLite KV and sign-in inside and beside transactions (tester round 2)',
  () => {
    const app = useFrogBot({
      writeLockTimeout: 300,
      hooks: {
        ...edgeHooks,
        afterChange: [
          ...(edgeHooks.afterChange ?? []),
          async ({ doc, req }) => {
            if (doc.title === 'KV in hook') await hookFrogBot!.kv.set('in-hook', 1);

            if (doc.title === 'Login in hook') {
              await hookFrogBot!.login({
                collection: membersSlug,
                data: credentials,
                req: req,
              });
            }

            return doc;
          },
        ],
      },
      collections: [
        {
          slug: membersSlug,
          auth: { signIn: [identity] },
          access: { read: () => true },
          fields: [],
        },
      ],
    });
    let slow: Promise<unknown> | undefined;

    beforeEach(() => {
      hookFrogBot = app.frogbot;
    });

    afterEach(async () => {
      releaseSlowHook();
      await slow?.catch(() => undefined);
      slow = undefined;
    });

    it('a KV write inside a hook of a create with a transaction fails with the lock error, then KV works', async () => {
      expect(causes(await app.create('KV in hook').catch((error: unknown) => error))).toMatch(
        lockTimeoutMessage,
      );
      await app.frogbot.kv.set('after', 2);

      expect(await app.frogbot.kv.get('after')).toBe(2);
      expect(await app.titlesAfterRestart()).toEqual([]);
    });

    it('a login inside a hook of a create with a transaction fails with the lock error, then logins work', async () => {
      await app.frogbot.create({ collection: membersSlug, data: credentials });

      expect(causes(await app.create('Login in hook').catch((error: unknown) => error))).toMatch(
        lockTimeoutMessage,
      );
      await expect(
        app.frogbot.login({ collection: membersSlug, data: credentials }),
      ).resolves.toHaveProperty('token');
    });

    async function logout(token: string) {
      const response = await app.frogbot.handleRequest(
        new Request(`http://localhost/api/${membersSlug}/logout`, {
          method: 'POST',
          headers: { authorization: `JWT ${token}` },
        }),
      );

      return response.status;
    }

    it('two logins and a logout racing each other all complete', async () => {
      await app.frogbot.create({ collection: membersSlug, data: credentials });

      const { token } = await app.frogbot.login({ collection: membersSlug, data: credentials });

      const [first, second, loggedOut] = await Promise.all([
        app.frogbot.login({ collection: membersSlug, data: credentials }),
        app.frogbot.login({ collection: membersSlug, data: credentials }),
        logout(token!),
      ]);

      expect({ first: Boolean(first.token), second: Boolean(second.token), loggedOut }).toEqual({
        first: true,
        second: true,
        loggedOut: 200,
      });
    });

    it('two logins and a logout racing a short transaction all complete', async () => {
      await app.frogbot.create({ collection: membersSlug, data: credentials });

      const { token } = await app.frogbot.login({ collection: membersSlug, data: credentials });
      const entered = gateSlowHook();

      slow = app.create('Slow beside logins');
      await entered;

      const racing = Promise.all([
        app.frogbot.login({ collection: membersSlug, data: credentials }),
        app.frogbot.login({ collection: membersSlug, data: credentials }),
        logout(token!),
      ]);

      await setImmediate();
      releaseSlowHook();

      const [first, second, loggedOut] = await racing;

      expect({ first: Boolean(first.token), second: Boolean(second.token), loggedOut }).toEqual({
        first: true,
        second: true,
        loggedOut: 200,
      });
      await slow;
    });

    it('a KV lock acquired, extended, and released beside a short transaction succeeds', async () => {
      const entered = gateSlowHook();

      slow = app.create('Slow beside KV');
      await entered;

      const acquiring = app.frogbot.kv.acquireLock('beside', 60_000);

      await setImmediate();
      releaseSlowHook();

      const lock = await acquiring;

      expect(lock).not.toBeNull();
      expect(await app.frogbot.kv.extendLock(lock!, 60_000)).toBe(true);
      expect(await app.frogbot.kv.releaseLock(lock!)).toBe(true);
    });
  },
);
