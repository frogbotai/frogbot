import type { FrogBotSanitizedConfig, SchemaSyncResult } from 'frogbot';
import { BasePayload } from 'payload';

import { findLosses, type Loss, withoutNoOps } from './guard.js';
import { countValues, databasePath, type LiveSchema, readLiveSchema } from './live.js';
import { type Kept, type RawTable, reconcile } from './reconcile.js';

type Adapter = {
  client?: { close: () => void };
  clientConfig?: { url?: string };
  prodMigrations?: unknown;
  push?: boolean;
  rawTables: Record<string, RawTable>;
  beforeSchemaInit?: SchemaHook[];
  schema: Record<string, unknown>;
  schemaName?: string;
  tablesFilter?: string[];
  drizzle: unknown;
  execute: (args: { drizzle: unknown; raw: string }) => Promise<unknown>;
  requireDrizzleKit: () => {
    pushSchema: (
      schema: Record<string, unknown>,
      drizzle: unknown,
      schemas?: string[],
      tablesFilter?: string[],
      extensions?: string[],
    ) => Promise<{ statementsToExecute: string[]; apply: () => Promise<void> }>;
  };
};

type SchemaHook = (args: { adapter: Adapter; schema: unknown }) => unknown;

class SchemaRefusal extends Error {}

function isSQLiteAdapter(db: object): db is Adapter {
  return 'rawTables' in db && 'requireDrizzleKit' in db && 'execute' in db;
}

function sqliteAdapterOf(db: object): Adapter {
  if (isSQLiteAdapter(db)) return db;

  throw new SchemaRefusal('the schema sync needs a SQLite database adapter');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function keptMessage(item: Kept, path: string | undefined): string {
  if (item.kind === 'table') {
    return `${item.table} is gone from the code; its ${plural(item.rows, 'row stays', 'rows stay')} hidden. Add the collection back to show them.`;
  }

  const values = countValues(path, item.table, item.column);
  const held = values
    ? `its ${plural(values, 'value stays', 'values stay')} hidden`
    : 'its column stays, empty';

  return `${item.table}.${item.column} is gone from the code; ${held}. Add "${item.column}" back to show them.`;
}

function shown(item: Kept, kept: Kept[]): boolean {
  if (/^(payload|frogbot)_|^_.+_v(_|$)/.test(item.table)) return false;

  return !kept.some(
    (other) =>
      other.kind === 'table' &&
      other.table !== item.table &&
      item.table.startsWith(`${other.table}_`),
  );
}

function lossText(loss: Loss, live: LiveSchema, path: string | undefined) {
  if (loss.kind === 'column') {
    const n = countValues(path, loss.table, loss.column);

    return `${loss.table}.${loss.column} (${plural(n, 'value', 'values')})`;
  }

  const rows = live.get(loss.table)?.rows ?? 0;

  return loss.kind === 'table'
    ? `${loss.table} (${plural(rows, 'row', 'rows')})`
    : `every row of ${loss.table} (${plural(rows, 'row', 'rows')})`;
}

/**
 * Payload's dev push (`pushDevSchema`), made additive-only and without its prompt: the adapter's schema is
 * reconciled with the live database before drizzle tables are built, push is computed through the adapter's
 * `requireDrizzleKit()` (so FrogBot's search tables keep their handling), and nothing is applied when a
 * statement would delete data. `payload_migrations` is never written.
 */
export async function syncSchema({
  config,
}: {
  config: FrogBotSanitizedConfig;
}): Promise<SchemaSyncResult> {
  const payloadConfig = await config._internal.payloadConfig;
  const db = payloadConfig.db;
  let live: LiveSchema = new Map();
  let path: string | undefined;
  let kept: Kept[] = [];

  payloadConfig.db = {
    ...db,
    init: (args) => {
      const database = db.init(args);
      const adapter = sqliteAdapterOf(database);

      if (adapter.prodMigrations !== undefined) {
        throw new SchemaRefusal(
          'prodMigrations is set, so migrations change the schema; run `frogbot migrate:create`.',
        );
      }

      adapter.push = false;
      path = databasePath(adapter.clientConfig?.url);

      const keep: SchemaHook = ({ adapter: built, schema }) => {
        live = readLiveSchema(path);
        kept = reconcile(built.rawTables, live);

        return schema;
      };

      adapter.beforeSchemaInit = [...(adapter.beforeSchemaInit ?? []), keep];

      return database;
    },
  };

  payloadConfig.jobs = { ...payloadConfig.jobs, autoRun: [] };

  const payload = new BasePayload();

  try {
    try {
      await payload.init({ config: payloadConfig, cron: false, disableOnInit: true });
    } catch (error) {
      if (error instanceof SchemaRefusal) {
        return { ok: false, error: error.message, applied: [], kept: [] };
      }

      throw error;
    }

    const adapter = sqliteAdapterOf(payload.db);
    const { pushSchema } = adapter.requireDrizzleKit();
    const keptMessages = kept
      .filter((item) => shown(item, kept))
      .map((item) => keptMessage(item, path));

    const applied: string[] = [];

    for (let pass = 0; pass < 3; pass++) {
      const push = await pushSchema(
        adapter.schema,
        adapter.drizzle,
        adapter.schemaName ? [adapter.schemaName] : undefined,
        adapter.tablesFilter,
      );

      const statements = push.statementsToExecute;

      statements.splice(0, statements.length, ...withoutNoOps(statements, live));

      if (!statements.length) break;

      const losses = findLosses(statements, live);
      const changed = applied.length
        ? `stopped after ${plural(applied.length, 'change', 'changes')}`
        : 'changed nothing';

      if (losses.length) {
        const what = losses.map((loss) => lossText(loss, live, path)).join(', ');

        return {
          ok: false,
          error: `The schema sync ${changed}: this version would delete ${what}. Keep it in the code, or write a migration.`,
          applied,
          kept: keptMessages,
        };
      }

      const run = (raw: string) => adapter.execute({ drizzle: adapter.drizzle, raw });

      await run('PRAGMA foreign_keys=OFF');
      await run('BEGIN');

      try {
        await push.apply();
        await run('COMMIT');
      } catch (error) {
        await run('ROLLBACK').catch(() => {});

        const reason = error instanceof Error ? error.message : String(error);

        return {
          ok: false,
          error: `The schema sync ${changed}: SQLite refused this version's schema (${reason.split('\n')[0]}).`,
          applied,
          kept: keptMessages,
        };
      } finally {
        await run('PRAGMA foreign_keys=ON');
      }

      applied.push(...statements);
      live = readLiveSchema(path);
    }

    return { ok: true, applied, kept: keptMessages };
  } finally {
    const client = payload.db && isSQLiteAdapter(payload.db) ? payload.db.client : undefined;

    await payload.destroy().catch(() => {});
    client?.close();
  }
}
