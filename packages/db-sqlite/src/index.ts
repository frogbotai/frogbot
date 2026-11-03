import { createClient } from '@libsql/client';
import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  type SQLiteAdapter,
  sqliteAdapter as createSQLiteAdapter,
  type SQLiteAdapterArgs as PayloadSQLiteAdapterArgs,
} from '@payloadcms/db-sqlite';
import { installSQLJobOperations } from 'frogbot/jobs';
import { sqliteSearchAdapter } from 'frogbot/search';

import { installDevSync, syncInDev } from './schema/dev.js';
import { syncSchema } from './schema/sync.js';
import { sqliteSnapshot } from './snapshot.js';
import { connectionPragmas, installWriteLock, takeCommitError } from './writeLock.js';

export { sql } from '@payloadcms/db-sqlite';
export type { MigrateDownArgs, MigrateUpArgs, SQLiteAdapter };

export type SQLiteAdapterArgs = PayloadSQLiteAdapterArgs & {
  /**
   * Milliseconds a write waits for the write or transaction ahead of it before it fails. Defaults to `5000`.
   */
  writeLockTimeout?: number;
};

/**
 * Payload's SQLite adapter with FrogBot's write lock and job operations. On a file database without
 * `prodMigrations`, its schema sync replaces Payload's dev push: outside production it adds tables,
 * columns and indexes, never drops data and never asks.
 */
export function sqliteAdapter({ writeLockTimeout = 5000, ...args }: SQLiteAdapterArgs) {
  const sync = isFileDatabase(args.client?.url) && args.prodMigrations === undefined;
  const devSync = sync && args.push !== false;
  const adapterArgs = {
    ...args,
    busyTimeout: args.busyTimeout ?? 1000,
    wal: args.wal ?? isFileDatabase(args.client?.url),
    ...(devSync && { push: false }),
  };

  const adapter = createSQLiteAdapter(adapterArgs);

  return {
    ...adapter,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const signIn = initArgs.payload.config?.collections.some(
        (collection) => collection.custom?.frogbot?.signIn?.length,
      );

      const database =
        signIn && args.transactionOptions === undefined
          ? createSQLiteAdapter({ ...adapterArgs, transactionOptions: {} }).init(initArgs)
          : adapter.init(initArgs);

      database.packageName = '@frogbotai/db-sqlite';

      const { commitTransaction, connect } = database;

      database.commitTransaction = async function (this: SQLiteAdapter, id) {
        const transactionID = id instanceof Promise ? await id : id;
        const transaction = libsqlTransaction(this.sessions[transactionID]);

        await commitTransaction.call(this, transactionID);

        const error = takeCommitError(transaction);

        if (error) throw error;
      };

      if (connect) {
        database.connect = async function (this: SQLiteAdapter, options) {
          if (!this.client && !this.wal && isFileDatabase(this.clientConfig.url)) {
            await useRollbackJournal(this);
          }

          await connect.call(this, options);

          installWriteLock({
            client: this.client,
            pragmas: connectionPragmas(this),
            timeout: writeLockTimeout,
          });

          if (devSync) await syncInDev(this);
        };
      }

      if (devSync) installDevSync(database);

      installSQLJobOperations({ adapter: database, dialect: 'sqlite' });

      return database;
    },
    search: sqliteSearchAdapter,
    ...(isFileDatabase(args.client?.url) && { snapshot: sqliteSnapshot(args.client) }),
    ...(sync && { syncSchema }),
  };
}

function isFileDatabase(url: string | undefined): boolean {
  return Boolean(url?.startsWith('file:') && !/:memory:|mode=memory/.test(url));
}

function libsqlTransaction(session: SQLiteAdapter['sessions'][string] | undefined) {
  return (session?.db as { session?: { tx?: object } } | undefined)?.session?.tx;
}

async function useRollbackJournal(adapter: SQLiteAdapter): Promise<void> {
  try {
    adapter.client = createClient(adapter.clientConfig);

    for (const pragma of connectionPragmas(adapter)) await adapter.client.execute(pragma);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    adapter.payload.logger.error({
      err: error,
      msg: `Error: cannot connect to SQLite: ${message}`,
    });

    adapter.rejectInitializing?.();

    throw new Error(`Error: cannot connect to SQLite: ${message}`);
  }

  try {
    const { rows } = await adapter.client.execute('PRAGMA journal_mode');

    if (rows[0]?.journal_mode !== 'wal') return;

    adapter.payload.logger.info('[db-sqlite] Disabling WAL mode: `wal` is false.');
    await adapter.client.execute('PRAGMA journal_mode = DELETE');
  } catch (error) {
    adapter.payload.logger.warn({
      err: error,
      msg: `[db-sqlite] Could not disable WAL mode, so the database stays in WAL: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
