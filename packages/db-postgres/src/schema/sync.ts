import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FrogBotSanitizedConfig, SchemaSyncResult } from 'frogbot';
import { BasePayload } from 'payload';

import {
  findLosses,
  findNewUniques,
  findTypeChanges,
  type Loss,
  type NewUnique,
  withoutKept,
  withoutNoOps,
} from './guard.js';
import {
  clientQuery,
  countDuplicates,
  countValues,
  type LiveSchema,
  type Query,
  readLiveSchema,
} from './live.js';
import { type Kept, type RawTable, reconcile } from './reconcile.js';

type Row = Record<string, unknown>;

type Client = {
  connect: () => Promise<void>;
  end: () => Promise<void>;
  query: (sql: string, args?: unknown[]) => Promise<{ rows: Row[] }>;
};

export type SchemaAdapter = {
  pg: { Client: new (options: unknown) => Client };
  pool?: PostgresAdapter['pool'];
  poolOptions?: unknown;
  prodMigrations?: unknown;
  push?: boolean;
  rawTables: Record<string, RawTable>;
  beforeSchemaInit: SchemaHook[];
  schema: Record<string, unknown>;
  schemaName?: string;
  tablesFilter?: string[];
  extensions?: Record<string, boolean>;
  requireDrizzleKit: () => Promise<{
    pushSchema: (
      schema: Record<string, unknown>,
      drizzle: unknown,
      schemas?: string[],
      tablesFilter?: string[],
      extensions?: string[],
    ) => Promise<{ statementsToExecute: string[] }>;
  }>;
};

type SchemaHook = (args: { adapter: SchemaAdapter; schema: unknown }) => unknown;

/** What the reconcile saw before the drizzle tables were built: the live schema and what it kept. */
export type Reconciled = { live: LiveSchema; kept: Kept[] };

class SchemaRefusal extends Error {}

export function isPostgresAdapter(db: object): db is SchemaAdapter {
  return 'rawTables' in db && 'requireDrizzleKit' in db && 'pg' in db && 'poolOptions' in db;
}

function postgresAdapterOf(db: object): SchemaAdapter {
  if (isPostgresAdapter(db)) return db;

  throw new SchemaRefusal('the schema sync needs a Postgres database adapter');
}

const schemaNameOf = (adapter: SchemaAdapter) => adapter.schemaName || 'public';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function shown(item: Kept, kept: Kept[]): boolean {
  if (/^(payload|frogbot)_|^_.+_v(_|$)/.test(item.table)) return false;

  return !kept.some(
    (other) =>
      other.kind === 'table' &&
      other.table !== item.table &&
      item.table.startsWith(`${other.table}_`),
  );
}

/**
 * One line naming every kept table and column a user would recognize, or none. Version and internal
 * tables stay quiet. It carries no counts, so it changes only when the kept set does.
 */
export function keptSummary({ kept }: Reconciled): string[] {
  const items = kept.filter((item) => shown(item, kept));

  if (!items.length) return [];

  const columns = items.filter((item) => item.kind === 'column').length;
  const tables = items.length - columns;
  const counts = [
    ...(columns ? [plural(columns, 'removed column', 'removed columns')] : []),
    ...(tables ? [plural(tables, 'removed table', 'removed tables')] : []),
  ];

  const names = items.map((item) =>
    item.kind === 'table' ? item.table : `${item.table}.${item.column}`,
  );

  return [
    `Schema sync kept ${counts.join(' and ')} with their data, hidden: ${names.join(', ')}. Nothing is deleted; a field or collection added back shows its data again.`,
  ];
}

async function lossText(loss: Loss, live: LiveSchema, query: Query, schemaName: string) {
  if (loss.kind === 'column') {
    const n = await countValues(query, schemaName, loss.table, loss.column);

    return `${loss.table}.${loss.column} (${plural(n, 'value', 'values')})`;
  }

  const rows = live.get(loss.table)?.rows ?? 0;

  return loss.kind === 'table'
    ? `${loss.table} (${plural(rows, 'row', 'rows')})`
    : `every row of ${loss.table} (${plural(rows, 'row', 'rows')})`;
}

const uniqueName = ({ table, columns }: NewUnique) =>
  columns.length === 1 ? `${table}.${columns[0]}` : `${table}.(${columns.join(', ')})`;

async function refusals(
  statements: string[],
  live: LiveSchema,
  query: Query,
  schemaName: string,
): Promise<string | undefined> {
  const losses = findLosses(statements, live);

  if (losses.length) {
    const texts: string[] = [];

    for (const loss of losses) texts.push(await lossText(loss, live, query, schemaName));

    const what = texts.join(', ');

    return `this version would delete ${what}. Keep it in the code, or write a migration.`;
  }

  const changes = findTypeChanges(statements, live);

  if (changes.length) {
    return changes
      .map(
        ({ table, column, from, to, rows }) =>
          `${table}.${column} can't change from ${from} to ${to} while ${table} has ${plural(rows, 'row', 'rows')}; change the field back, or write a migration.`,
      )
      .join(' ');
  }

  const duplicates: string[] = [];

  for (const unique of findNewUniques(statements, live)) {
    const n = await countDuplicates(query, schemaName, unique.table, unique.columns);

    if (n) {
      duplicates.push(
        `${uniqueName(unique)} has ${plural(n, 'duplicate value', 'duplicate values')}, so it can't become unique. Remove the duplicates, then share again.`,
      );
    }
  }

  return duplicates.length ? duplicates.join(' ') : undefined;
}

/**
 * A beforeSchemaInit hook that reads the live database on a client of its own (none when
 * `PAYLOAD_DROP_DATABASE` is about to empty it, or the database doesn't exist yet) and adds what the code
 * lacks to the raw schema, so the drizzle tables built from it keep every live table and column.
 */
export function keepLive(adapter: SchemaAdapter, onReconciled: (state: Reconciled) => void) {
  const hook: SchemaHook = async ({ adapter: built, schema }) => {
    const live =
      process.env.PAYLOAD_DROP_DATABASE === 'true' ? new Map() : await readBeforeConnect(adapter);

    onReconciled({ live, kept: reconcile(built.rawTables, live) });

    return schema;
  };

  adapter.beforeSchemaInit = [...adapter.beforeSchemaInit, hook];
}

async function readBeforeConnect(adapter: SchemaAdapter): Promise<LiveSchema> {
  const client = new adapter.pg.Client(adapter.poolOptions);

  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => {});

    if ((error as { code?: string }).code === '3D000') return new Map();

    throw error;
  }

  try {
    return await readLiveSchema(clientQuery(client), schemaNameOf(adapter));
  } finally {
    await client.end();
  }
}

function queued(execute: (query: unknown) => Promise<unknown>) {
  let last: Promise<unknown> = Promise.resolve();

  return {
    execute: (query: unknown) => {
      const next = last.then(() => execute(query));

      last = next.catch(() => {});

      return next;
    },
  };
}

/**
 * Pushes the adapter's schema through its `requireDrizzleKit()` in one transaction on one checked-out
 * client, and applies nothing when a statement would delete data, change a column's type on a table with
 * rows, or make a column with duplicates unique. Never prompts and never writes `payload_migrations`.
 */
export async function pushAdditive(
  adapter: SchemaAdapter,
  reconciled: Reconciled,
): Promise<{ ok: true; applied: string[] } | { ok: false; error: string; applied: string[] }> {
  if (!adapter.pool) throw new Error('the schema sync needs a connected Postgres adapter');

  const { pushSchema } = await adapter.requireDrizzleKit();
  const schemaName = schemaNameOf(adapter);
  const client = await adapter.pool.connect();
  const query = clientQuery(client);
  const connection = drizzle({ client });
  const db = queued((query) =>
    connection.execute(query as Parameters<typeof connection.execute>[0]),
  );

  const keptTables = new Set(
    reconciled.kept.flatMap((item) => (item.kind === 'table' ? [item.table] : [])),
  );

  const keptColumns = new Set(
    reconciled.kept.flatMap((item) =>
      item.kind === 'column' ? [`${item.table}.${item.column}`] : [],
    ),
  );

  const applied: string[] = [];
  let repeated = '';
  const refuse = async (error: string) => {
    await client.query('ROLLBACK');

    return { ok: false as const, error: `The schema sync changed nothing: ${error}`, applied: [] };
  };

  try {
    await client.query('BEGIN');

    for (let pass = 0; pass < 3; pass++) {
      const live = await readLiveSchema(query, schemaName);
      const push = await pushSchema(
        adapter.schema,
        db,
        adapter.schemaName ? [adapter.schemaName] : undefined,
        adapter.tablesFilter,
        adapter.extensions?.postgis ? ['postgis'] : undefined,
      );

      const statements = withoutKept(
        withoutNoOps(push.statementsToExecute, live),
        keptTables,
        keptColumns,
        live,
      );

      if (!statements.length || statements.join('\n') === repeated) break;

      repeated = statements.join('\n');

      const refusal = await refusals(statements, live, query, schemaName);

      if (refusal) return await refuse(refusal);

      const enumValues = statements.filter((statement) => addEnumValue.test(statement));
      const ordered = [
        ...enumValues,
        ...statements.filter((statement) => !addEnumValue.test(statement)),
      ];

      for (const [index, statement] of ordered.entries()) {
        if (enumValues.length && index === enumValues.length) {
          await client.query('COMMIT');
          await client.query('BEGIN');
        }

        try {
          await client.query(statement);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);

          return await refuse(`Postgres refused this version's schema (${reason.split('\n')[0]}).`);
        }
      }

      applied.push(...statements);
    }

    await client.query('COMMIT');

    return { ok: true, applied };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

const addEnumValue = /^\s*ALTER\s+TYPE\s+.+\s+ADD\s+VALUE\b/i;

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
  let reconciled: Reconciled = { live: new Map(), kept: [] };

  payloadConfig.db = {
    ...db,
    init: (args) => {
      const database = db.init(args);
      const adapter = postgresAdapterOf(database);

      if (adapter.prodMigrations !== undefined) {
        throw new SchemaRefusal(
          'prodMigrations is set, so migrations change the schema; run `frogbot migrate:create`.',
        );
      }

      adapter.push = false;
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

    const adapter = postgresAdapterOf(payload.db);
    const kept = keptSummary(reconciled);
    const result = await pushAdditive(adapter, reconciled);

    return { ...result, kept };
  } finally {
    const pool = payload.db && isPostgresAdapter(payload.db) ? payload.db.pool : undefined;

    await payload.destroy().catch(() => {});
    await pool?.end().catch(() => {});
  }
}
