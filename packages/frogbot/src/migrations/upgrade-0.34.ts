import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { DrizzleAdapter } from '@payloadcms/drizzle';
import { sql } from 'drizzle-orm';
import type { DynamicMigrationTemplate, Payload, PayloadRequest } from 'payload';
import toSnakeCase from 'to-snake-case';

import { assertDrizzleAdapter } from '../database/guards.js';

/** One stored author column from FrogBot 0.33 or earlier and the authorship field it copies into. */
export type AuthorshipColumn = {
  table: string;
  column: string;
  /** The auth collection the column points at. */
  relationTo: string;
  /** `null` skips the column; it's dropped by the next `migrate:create`. */
  to: 'createdBy' | 'updatedBy' | null;
};

/** Field names a FrogBot 0.33 document stored its authors under, for MongoDB. */
export type AuthorshipKeys = Record<string, 'createdBy' | 'updatedBy' | null>;

type SnapshotColumn = { name: string };

type SnapshotForeignKey = {
  columnsFrom: string[];
  columnsTo: string[];
  tableFrom: string;
  tableTo: string;
};

type SnapshotTable = {
  name: string;
  columns: Record<string, SnapshotColumn>;
  foreignKeys?: Record<string, SnapshotForeignKey>;
  indexes?: Record<string, { columns: unknown[] }>;
};

type Snapshot = {
  id?: string;
  prevId?: string;
  tables: Record<string, SnapshotTable>;
  version: string;
};

type StatementWriter = {
  executeMethod: string;
  sanitizeStatements: (args: { sqlExecute: string; statements: string[] }) => string;
};

type NativeCollection = {
  updateMany: (
    filter: object,
    update: object[],
    options?: { session?: unknown },
  ) => Promise<unknown>;
};

const feature = 'The upgrade migration';

function statementWriter(adapter: DrizzleAdapter): StatementWriter {
  if (adapter.name === 'sqlite') {
    return {
      executeMethod: 'run',
      sanitizeStatements: ({ sqlExecute, statements }) =>
        statements
          .map((statement) => `${sqlExecute}${statement.replaceAll('`', '\\`')}\`)`)
          .join('\n'),
    };
  }

  if (adapter.name === 'postgres') {
    return {
      executeMethod: 'execute',
      sanitizeStatements: ({ sqlExecute, statements }) =>
        `${sqlExecute}\n ${statements.join('\n')}\`)`,
    };
  }

  throw new Error(
    `[frogbot] ${feature} needs a Postgres or SQLite adapter that writes migrations.`,
  );
}

const KNOWN_COLUMNS: Record<string, AuthorshipColumn['to']> = {
  created_by_id: 'createdBy',
  last_modified_by_id: 'updatedBy',
};

const VERSION_PREFIX = 'version_';

function isDrizzle(payload: Payload): boolean {
  return payload.db.name === 'postgres' || payload.db.name === 'sqlite';
}

function authTables(adapter: DrizzleAdapter): Map<string, string> {
  const tables = new Map<string, string>();

  for (const collection of adapter.payload.config.collections) {
    if (!collection.auth) continue;

    const table = adapter.tableNameMap.get(toSnakeCase(collection.slug));

    if (table) tables.set(table, collection.slug);
  }

  return tables;
}

function collectionTables(adapter: DrizzleAdapter): Set<string> {
  const tables = new Set<string>();
  const versionsSuffix = adapter.versionsSuffix ?? '_v';

  for (const collection of adapter.payload.config.collections) {
    const table = adapter.tableNameMap.get(toSnakeCase(collection.slug));

    if (!table) continue;

    tables.add(table);
    tables.add(`_${table}${versionsSuffix}`);
  }

  return tables;
}

async function readLatestSnapshot(adapter: DrizzleAdapter): Promise<Snapshot | undefined> {
  const latest = readdirSync(adapter.migrationDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .reverse()[0];

  if (!latest) return undefined;

  const { generateDrizzleJson, upSnapshot } = adapter.requireDrizzleKit();
  const current = (await generateDrizzleJson(adapter.schema)).version;
  const snapshot: Snapshot = JSON.parse(
    readFileSync(path.join(adapter.migrationDir, latest), 'utf8'),
  );

  return upSnapshot && snapshot.version < current ? (upSnapshot(snapshot) as Snapshot) : snapshot;
}

function findTable(snapshot: Snapshot, name: string): [string, SnapshotTable] | undefined {
  return Object.entries(snapshot.tables).find(([, table]) => table.name === name);
}

/**
 * The author columns a previous snapshot has and the current schema doesn't: single relations
 * from a collection (or its versions) table to an auth collection's table.
 */
export function droppedAuthorColumns({
  adapter,
  previous,
  next,
}: {
  adapter: DrizzleAdapter;
  previous: Snapshot;
  next: Snapshot;
}): AuthorshipColumn[] {
  const auth = authTables(adapter);
  const owners = collectionTables(adapter);
  const dropped: AuthorshipColumn[] = [];

  for (const table of Object.values(previous.tables)) {
    if (!owners.has(table.name)) continue;

    const current = findTable(next, table.name)?.[1];

    for (const key of Object.values(table.foreignKeys ?? {})) {
      const [column] = key.columnsFrom;
      const relationTo = auth.get(key.tableTo);

      if (key.columnsFrom.length !== 1 || !relationTo || current?.columns[column]) continue;

      const field = column.startsWith(VERSION_PREFIX)
        ? column.slice(VERSION_PREFIX.length)
        : column;

      dropped.push({ table: table.name, column, relationTo, to: KNOWN_COLUMNS[field] ?? null });
    }
  }

  return dropped;
}

/** The current schema, still holding the dropped author columns until their values are copied. */
function keepColumns({
  columns,
  previous,
  next,
}: {
  columns: AuthorshipColumn[];
  previous: Snapshot;
  next: Snapshot;
}): Snapshot {
  const kept = structuredClone(next);

  for (const { table, column } of columns) {
    const [, before] = findTable(previous, table)!;
    const after = findTable(kept, table)?.[1];

    if (!after) continue;

    after.columns[column] = before.columns[column];

    for (const [name, key] of Object.entries(before.foreignKeys ?? {})) {
      if (key.columnsFrom.includes(column)) (after.foreignKeys ??= {})[name] = key;
    }

    for (const [name, index] of Object.entries(
      (before as { indexes?: Record<string, { columns: unknown[] }> }).indexes ?? {},
    )) {
      const names = index.columns.map((entry) =>
        typeof entry === 'string' ? entry : (entry as { expression?: string }).expression,
      );

      if (names.length === 1 && names[0] === column) (after.indexes ??= {})[name] = index;
    }
  }

  return kept;
}

const RECREATE_COPY = /^INSERT INTO `__new_([^`]+)`\(([^)]*)\) SELECT [^;]* FROM `\1`;$/;

// Workaround: https://github.com/drizzle-team/drizzle-orm/issues/1313
function copyStoredColumns(statements: string[], previous: Snapshot): string[] {
  return statements.map((statement) => {
    const match = RECREATE_COPY.exec(statement);
    const stored = match && findTable(previous, match[1])?.[1];

    if (!match || !stored) return statement;

    const columns = match[2]
      .split(', ')
      .filter((column) => stored.columns[column.replaceAll('"', '')])
      .join(', ');

    return `INSERT INTO \`__new_${match[1]}\`(${columns}) SELECT ${columns} FROM \`${match[1]}\`;`;
  });
}

type Entities = Record<string, unknown>;

const SNAPSHOT_ENTITIES = ['enums', 'policies', 'roles', 'schemas', 'sequences', 'views'];

const TABLE_ENTITIES = [
  'checkConstraints',
  'columns',
  'compositePrimaryKeys',
  'foreignKeys',
  'indexes',
  'policies',
  'uniqueConstraints',
];

function isEntities(value: unknown): value is Entities {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeEntities<T extends object>(previous: T, next: T, keys: string[]): T {
  const merged = { ...next };

  for (const key of keys) {
    const before: unknown = Reflect.get(previous, key);
    const after: unknown = Reflect.get(next, key);

    if (isEntities(before) || isEntities(after)) {
      Reflect.set(merged, key, {
        ...(isEntities(before) ? before : {}),
        ...(isEntities(after) ? after : {}),
      });
    }
  }

  return merged;
}

/**
 * Both schemas at once. drizzle-kit asks whether each table or column that appears where another
 * disappears was renamed, which needs a terminal; nothing in this upgrade is a rename. Diffing
 * through this snapshot gives it only additions, then only removals, so it never asks.
 */
function unionSnapshot(previous: Snapshot, next: Snapshot): Snapshot {
  const union = mergeEntities(structuredClone(previous), structuredClone(next), SNAPSHOT_ENTITIES);

  union.tables = { ...structuredClone(previous.tables) };

  for (const [key, table] of Object.entries(structuredClone(next.tables))) {
    const before = union.tables[key];

    union.tables[key] = before ? mergeEntities(before, table, TABLE_ENTITIES) : table;
  }

  return union;
}

type GenerateMigration = ReturnType<DrizzleAdapter['requireDrizzleKit']>['generateMigration'];

type KitSnapshot = Parameters<GenerateMigration>[0];

async function diff(
  generateMigration: GenerateMigration,
  from: Snapshot,
  to: Snapshot,
): Promise<string[]> {
  const union = unionSnapshot(from, to);

  return [
    ...copyStoredColumns(await generateMigration(from as KitSnapshot, union as KitSnapshot), from),
    ...copyStoredColumns(await generateMigration(union as KitSnapshot, to as KitSnapshot), union),
  ];
}

function describe(columns: AuthorshipColumn[]): string {
  return `[\n${columns
    .map(
      ({ table, column, relationTo, to }) =>
        `  { table: '${table}', column: '${column}', relationTo: '${relationTo}', to: ${to ? `'${to}'` : 'null'} },`,
    )
    .join('\n')}\n]`;
}

/**
 * `frogbot migrate:create upgrade --file frogbot/migrations/upgrade-0.34` on SQL: the 0.34 schema
 * change, keeping each old author column until its values are copied into `createdBy` or
 * `updatedBy`. It writes that schema as the snapshot, so the next `migrate:create` drops the old
 * columns.
 */
export const dynamic: DynamicMigrationTemplate = async ({ filePath, payload }) => {
  if (!isDrizzle(payload)) return {};

  const adapter = assertDrizzleAdapter(payload.db, feature);
  const writer = statementWriter(adapter);
  const previous = await readLatestSnapshot(adapter);

  if (!previous) {
    throw new Error(
      `[frogbot] ${feature} needs the previous schema's migration snapshot to diff against.`,
    );
  }

  const { generateDrizzleJson, generateMigration } = adapter.requireDrizzleKit();
  const next = (await generateDrizzleJson(adapter.schema)) as Snapshot;
  const columns = droppedAuthorColumns({ adapter, previous, next });
  const kept = keepColumns({ columns, previous, next });
  const sqlExecute = `await db.${writer.executeMethod}(` + 'sql`';
  const up = await diff(generateMigration, previous, kept);
  const down = await diff(generateMigration, kept, previous);

  writeFileSync(`${filePath}.json`, JSON.stringify(kept, null, 2));

  const unassigned = columns.filter(({ to }) => to === null);

  if (unassigned.length) {
    payload.logger.warn(
      `[frogbot] Assign these author columns to 'createdBy' or 'updatedBy' in ${path.basename(filePath)}.ts, or leave null to drop them: ${unassigned
        .map(({ table, column }) => `${table}.${column}`)
        .join(', ')}`,
    );
  }

  return {
    imports: `import { authorshipMigration, type AuthorshipColumn } from 'frogbot/migrations'

/** Author columns from FrogBot 0.33 and the field each copies into: 'createdBy', 'updatedBy' or null to drop it. */
const authorship: AuthorshipColumn[] = ${describe(columns)}`,
    upSQL: `${up.length ? `${writer.sanitizeStatements({ sqlExecute, statements: up })}\n` : ''}await authorshipMigration({ db, payload, req, columns: authorship })`,
    downSQL: down.length
      ? writer.sanitizeStatements({ sqlExecute, statements: down })
      : '// Migration code',
  };
};

/** MongoDB: no schema to change, so the migration renames document keys. */
export const imports = `import { authorshipMigration, type AuthorshipKeys } from 'frogbot/migrations'

/** Author fields from FrogBot 0.33 and the field each moves to: 'createdBy', 'updatedBy' or null to keep it. */
const authorship: AuthorshipKeys = { createdBy: 'createdBy', lastModifiedBy: 'updatedBy' }`;

export const upSQL = `  await authorshipMigration({ payload, req, keys: authorship })
`;

export const downSQL = `  // Migration code
`;

async function copyColumns({
  columns,
  db,
  payload,
}: {
  columns: AuthorshipColumn[];
  db: unknown;
  payload: Payload;
}): Promise<void> {
  const adapter = assertDrizzleAdapter(payload.db, feature);
  const relationships = adapter.relationshipsSuffix ?? '_rels';

  for (const { table, column, relationTo, to } of columns) {
    if (!to) continue;

    const versioned = column.startsWith(VERSION_PREFIX);
    const fieldPath = versioned ? `version.${to}` : to;
    const target = adapter.tableNameMap.get(toSnakeCase(relationTo)) ?? toSnakeCase(relationTo);

    await adapter.execute({
      db: db as Parameters<DrizzleAdapter['execute']>[0]['db'],
      sql: sql`insert into ${sql.identifier(`${table}${relationships}`)} (${sql.identifier('parent_id')}, ${sql.identifier('path')}, ${sql.identifier(`${target}_id`)}) select ${sql.identifier('id')}, ${fieldPath}, ${sql.identifier(column)} from ${sql.identifier(table)} where ${sql.identifier(column)} is not null and not exists (select 1 from ${sql.identifier(`${table}${relationships}`)} ${sql.identifier('existing')} where ${sql.identifier('existing')}.${sql.identifier('parent_id')} = ${sql.identifier(table)}.${sql.identifier('id')} and ${sql.identifier('existing')}.${sql.identifier('path')} = ${fieldPath})`,
    });
  }
}

function authCollection(payload: Payload): string {
  const auth = payload.config.collections.filter(({ auth }) => auth).map(({ slug }) => slug);

  if (auth.length === 1) return auth[0];

  if (payload.config.admin.user && auth.includes(payload.config.admin.user)) {
    return payload.config.admin.user;
  }

  throw new Error(
    `[frogbot] ${feature} can't tell which auth collection the old authors point at (${auth.join(', ')}). Set admin.user.`,
  );
}

async function moveKeys({
  keys,
  payload,
  req,
}: {
  keys: AuthorshipKeys;
  payload: Payload;
  req?: Partial<PayloadRequest>;
}): Promise<void> {
  const relationTo = authCollection(payload);
  const transactionID = await req?.transactionID;
  const sessions = 'sessions' in payload.db ? payload.db.sessions : undefined;
  const session =
    transactionID && sessions && typeof sessions === 'object'
      ? (sessions as Record<string, unknown>)[String(transactionID)]
      : undefined;
  const models = 'collections' in payload.db ? payload.db.collections : undefined;

  if (!models || typeof models !== 'object') {
    throw new Error(`[frogbot] ${feature} needs a MongoDB adapter with collection models.`);
  }

  for (const collection of payload.config.collections) {
    const model: { collection?: NativeCollection } | undefined = (
      models as Record<string, { collection?: NativeCollection }>
    )[collection.slug];

    if (!model?.collection) continue;

    for (const [from, to] of Object.entries(keys)) {
      if (!to || !collection.authorship[to]) continue;

      const value = `$${from}`;

      await model.collection.updateMany(
        { [from]: { $exists: true, $ne: null }, [`${from}.relationTo`]: { $exists: false } },
        [{ $set: { [to]: { relationTo, value } } }, ...(from === to ? [] : [{ $unset: from }])],
        session ? { session } : undefined,
      );
    }
  }
}

/** Copies FrogBot 0.33 author values into the built-in `createdBy` and `updatedBy`. Timestamps don't change. */
export async function authorshipMigration({
  columns,
  db,
  keys,
  payload,
  req,
}: {
  columns?: AuthorshipColumn[];
  db?: unknown;
  keys?: AuthorshipKeys;
  payload: Payload;
  req?: Partial<PayloadRequest>;
}): Promise<void> {
  if (isDrizzle(payload)) {
    await copyColumns({ columns: columns ?? [], db, payload });

    return;
  }

  await moveKeys({ keys: keys ?? {}, payload, req });
}
