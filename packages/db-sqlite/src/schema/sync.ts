import type { FrogBotSanitizedConfig, SchemaSyncResult } from 'frogbot';
import { BasePayload } from 'payload';

import {
  findLosses,
  findTypeChanges,
  type Loss,
  withoutKeptTables,
  withoutNoOps,
} from './guard.js';
import {
  clientQuery,
  countNonNumbers,
  countValues,
  databasePath,
  type LiveSchema,
  type Query,
  readLiveSchema,
  withDatabase,
} from './live.js';
import { type Kept, type RawTable, reconcile } from './reconcile.js';

export type SchemaAdapter = {
  client?: {
    close: () => void;
    execute: (statement: {
      sql: string;
      args: string[];
    }) => Promise<{ rows: Record<string, unknown>[] }>;
  };
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

type SchemaHook = (args: { adapter: SchemaAdapter; schema: unknown }) => unknown;

/** What the reconcile saw before the drizzle tables were built: the live schema and what it kept. */
export type Reconciled = { live: LiveSchema; path: string | undefined; kept: Kept[] };

class SchemaRefusal extends Error {}

export function isSQLiteAdapter(db: object): db is SchemaAdapter {
  return 'rawTables' in db && 'requireDrizzleKit' in db && 'execute' in db;
}

function sqliteAdapterOf(db: object): SchemaAdapter {
  if (isSQLiteAdapter(db)) return db;

  throw new SchemaRefusal('the schema sync needs a SQLite database adapter');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function keptMessage(item: Kept, query: Query | undefined): Promise<string> {
  if (item.kind === 'table') {
    return `${item.table} is gone from the code; its ${plural(item.rows, 'row stays', 'rows stay')} hidden. Add the collection back to show them.`;
  }

  const values = await countValues(query, item.table, item.column);
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

/** One line per kept table or column a user would recognize; version and internal tables stay quiet. */
export function keptMessages(adapter: SchemaAdapter, { kept }: Reconciled): Promise<string[]> {
  const query = adapter.client && clientQuery(adapter.client);

  return Promise.all(
    kept.filter((item) => shown(item, kept)).map((item) => keptMessage(item, query)),
  );
}

async function lossText(loss: Loss, live: LiveSchema, query: Query | undefined) {
  if (loss.kind === 'column') {
    const n = await countValues(query, loss.table, loss.column);

    return `${loss.table}.${loss.column} (${plural(n, 'value', 'values')})`;
  }

  const rows = live.get(loss.table)?.rows ?? 0;

  return loss.kind === 'table'
    ? `${loss.table} (${plural(rows, 'row', 'rows')})`
    : `every row of ${loss.table} (${plural(rows, 'row', 'rows')})`;
}

/**
 * A beforeSchemaInit hook that, `when` it returns true, reads the live database (none when `PAYLOAD_DROP_DATABASE` is about to empty it) and adds what the code
 * lacks to the raw schema, so the drizzle tables built from it keep every live table and column.
 */
export function keepLive(
  adapter: SchemaAdapter,
  onReconciled: (state: Reconciled) => void,
  when: () => boolean = () => true,
) {
  const hook: SchemaHook = async ({ adapter: built, schema }) => {
    if (!when()) return schema;

    const path = databasePath(adapter.clientConfig?.url);
    const live =
      process.env.PAYLOAD_DROP_DATABASE === 'true'
        ? new Map()
        : adapter.client
          ? await readLiveSchema(clientQuery(adapter.client))
          : await withDatabase(path, readLiveSchema);

    onReconciled({ live, path, kept: reconcile(built.rawTables, live) });

    return schema;
  };

  adapter.beforeSchemaInit = [...(adapter.beforeSchemaInit ?? []), hook];
}

async function typeRefusals(
  statements: string[],
  live: LiveSchema,
  query: Query | undefined,
): Promise<string[]> {
  const refusals: string[] = [];

  for (const { table, column } of findTypeChanges(statements, live)) {
    const n = await countNonNumbers(query, table, column);

    if (!n) continue;

    const what =
      n === 1 ? "1 text value that isn't a number" : `${n} text values that aren't numbers`;

    refusals.push(
      `${table}.${column} holds ${what}; change the field back, or clear those values, then save again.`,
    );
  }

  return refusals;
}

/**
 * Pushes the adapter's schema through its `requireDrizzleKit()` (so FrogBot's search tables keep their
 * handling), one transaction per pass, and applies nothing when a statement would delete data or a type
 * change would hide stored values. Never prompts and never writes `payload_migrations`.
 */
export function pushAdditive(
  adapter: SchemaAdapter,
  reconciled: Reconciled,
): Promise<{ ok: true; applied: string[] } | { ok: false; error: string; applied: string[] }> {
  return pushPasses(adapter, reconciled, adapter.client && clientQuery(adapter.client));
}

async function pushPasses(
  adapter: SchemaAdapter,
  reconciled: Reconciled,
  query: Query | undefined,
): Promise<{ ok: true; applied: string[] } | { ok: false; error: string; applied: string[] }> {
  const { pushSchema } = adapter.requireDrizzleKit();
  const applied: string[] = [];
  const keptTables = new Set(
    reconciled.kept.flatMap((item) => (item.kind === 'table' ? [item.table] : [])),
  );

  let live = query ? await readLiveSchema(query) : reconciled.live;

  for (let pass = 0; pass < 3; pass++) {
    const push = await pushSchema(
      adapter.schema,
      adapter.drizzle,
      adapter.schemaName ? [adapter.schemaName] : undefined,
      adapter.tablesFilter,
    );

    const statements = push.statementsToExecute;

    statements.splice(
      0,
      statements.length,
      ...withoutKeptTables(withoutNoOps(statements, live), keptTables, live),
    );

    if (!statements.length) break;

    const losses = findLosses(statements, live);
    const changed = applied.length
      ? `stopped after ${plural(applied.length, 'change', 'changes')}`
      : 'changed nothing';

    if (losses.length) {
      const what = (await Promise.all(losses.map((loss) => lossText(loss, live, query)))).join(
        ', ',
      );

      return {
        ok: false,
        error: `The schema sync ${changed}: this version would delete ${what}. Keep it in the code, or write a migration.`,
        applied,
      };
    }

    const refusals = await typeRefusals(statements, live, query);

    if (refusals.length) {
      return { ok: false, error: `The schema sync ${changed}: ${refusals.join(' ')}`, applied };
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
      };
    } finally {
      await run('PRAGMA foreign_keys=ON');
    }

    applied.push(...statements);
    live = await readLiveSchema(query);
  }

  return { ok: true, applied };
}

/** Marks an adapter whose connect must not sync, because `syncSchema` runs the sync itself. */
export const syncing = new WeakSet<object>();

/**
 * Payload's dev push (`pushDevSchema`), made additive-only and without its prompt, in a fresh Payload
 * on `config`: the adapter's schema is reconciled with the live database before drizzle tables are built,
 * then pushed with `pushAdditive`. `frogbot up` runs it in a child process before each new server starts.
 */
export async function syncSchema({
  config,
}: {
  config: FrogBotSanitizedConfig;
}): Promise<SchemaSyncResult> {
  const payloadConfig = await config._internal.payloadConfig;
  const db = payloadConfig.db;
  let reconciled: Reconciled = { live: new Map(), path: undefined, kept: [] };

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
      syncing.add(database);
      keepLive(adapter, (state) => (reconciled = state));

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
    const kept = await keptMessages(adapter, reconciled);
    const result = await pushAdditive(adapter, reconciled);

    return { ...result, kept };
  } finally {
    const client = payload.db && isSQLiteAdapter(payload.db) ? payload.db.client : undefined;

    await payload.destroy().catch(() => {});
    client?.close();
  }
}
