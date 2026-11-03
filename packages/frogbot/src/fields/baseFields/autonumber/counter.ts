import {
  type BaseDatabaseAdapter,
  type DatabaseAdapter,
  type PayloadRequest,
  ValidationError,
  type Where,
} from 'payload';

import type { DocID } from '../../../collections/config/types.js';
import type { AutonumberEntry, AutonumberKeyEntry } from '../../../config/sanitized.js';
import type { FrogBot } from '../../../frogbot.js';
import { KVLockContentionError } from '../../../kv/errors.js';
import type { KV } from '../../../kv/types.js';
import { AUTONUMBER_KEYS_SLUG, AUTONUMBERS_SLUG } from './collection.js';

type AutonumberCounterArgs = {
  db: Pick<BaseDatabaseAdapter, 'findOne' | 'updateOne'>;
  key: string;
  req?: PayloadRequest;
};

type AutonumberNumberingArgs = AutonumberEntry & {
  db: DatabaseAdapter;
  kv: KV;
};

type AutonumberCounter = {
  id: number | string;
  key: string;
  value: number;
};

type NumberedDoc = Record<string, unknown> & { id: number | string };

const LOCK_TTL = 60_000;
const PAGE_SIZE = 100;
const WAIT_INTERVAL = 250;
const WAIT_TIMEOUT = 60_000;

export const AUTONUMBER_PENDING_MESSAGE =
  'Existing records are still being numbered. Try again in a moment.';

/**
 * The counter row's key. A scoped field has one counter per scope value, and a
 * marker without a value that says its existing records are numbered.
 */
export function autonumberKey(
  { collection, path, scope }: AutonumberEntry,
  scopeID?: DocID,
): string {
  const key = `${collection}.${path}`;

  if (!scope) return key;

  return scopeID === undefined ? `${key}[${scope.name}]` : `${key}[${scope.name}=${scopeID}]`;
}

export function scopeIDOf(value: unknown): DocID | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value;

  if (value !== null && typeof value === 'object' && 'id' in value) return scopeIDOf(value.id);

  return undefined;
}

export function autonumberError({
  collection,
  message,
  path,
  req,
}: AutonumberEntry & { message: string; req?: PayloadRequest }): ValidationError {
  return new ValidationError({ collection, errors: [{ path, message }], req });
}

export async function nextAutonumber({
  db,
  key,
  req,
}: AutonumberCounterArgs): Promise<number | null> {
  const counter = (await db.updateOne({
    collection: AUTONUMBERS_SLUG,
    where: { key: { equals: key } },
    data: { value: { $inc: 1 } },
    options: { atomic: true },
    req,
  })) as AutonumberCounter | null;

  return counter?.value ?? null;
}

export async function raiseAutonumber({
  db,
  key,
  req,
  value,
}: AutonumberCounterArgs & { value: number }): Promise<boolean> {
  const counter = await db.updateOne({
    collection: AUTONUMBERS_SLUG,
    where: { and: [{ key: { equals: key } }, { value: { less_than: value } }] },
    data: { value },
    options: { atomic: true },
    req,
  });

  return counter !== null;
}

export async function hasAutonumber(args: AutonumberCounterArgs): Promise<boolean> {
  const counter = await args.db.findOne<AutonumberCounter>({
    collection: AUTONUMBERS_SLUG,
    where: { key: { equals: args.key } },
    req: args.req,
  });

  return counter !== null;
}

export function valueAt(doc: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, segment) =>
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      doc,
    );
}

function withValueAt(
  doc: Record<string, unknown>,
  [name, ...rest]: string[],
  value: unknown,
): Record<string, unknown> {
  if (!rest.length) return { [name]: value };

  const group = doc[name];
  const sibling = (group !== null && typeof group === 'object' ? group : {}) as Record<
    string,
    unknown
  >;

  return { [name]: { ...sibling, ...withValueAt(sibling, rest, value) } };
}

export async function storedRecord({
  collection,
  db,
  id,
  req,
}: {
  collection: string;
  db: DatabaseAdapter;
  id: DocID;
  req?: PayloadRequest;
}): Promise<Record<string, unknown> | null> {
  return db.findOne({ collection, where: { id: { equals: id } }, req });
}

export function numberAt(doc: unknown, path: string): number | undefined {
  const value = valueAt(doc, path);

  return typeof value === 'number' ? value : undefined;
}

function withinScope({ scope }: AutonumberEntry, scopeID: DocID | undefined): Where[] {
  return scope && scopeID !== undefined ? [{ [scope.path]: { equals: scopeID } }] : [];
}

export async function highestAutonumber({
  collection,
  db,
  path,
  req,
  scope,
  scopeID,
}: AutonumberEntry & {
  db: DatabaseAdapter;
  req?: PayloadRequest;
  scopeID?: DocID;
}): Promise<number> {
  const { docs } = await db.find({
    collection,
    where: {
      and: [
        ...withinScope({ collection, path, scope }, scopeID),
        { [path]: { exists: true } },
        { [path]: { not_equals: null } },
      ],
    },
    sort: `-${path}`,
    limit: 1,
    pagination: false,
    req,
  });

  return numberAt(docs[0], path) ?? 0;
}

async function numberExistingRecords({
  collection,
  db,
  path,
  scope,
  signal,
}: AutonumberEntry & { db: DatabaseAdapter; signal: AbortSignal }): Promise<void> {
  const entry = { collection, path, scope };
  const key = autonumberKey(entry);

  if (await hasAutonumber({ db, key })) return;

  const timestamps = db.payload.collections[collection]?.config.timestamps !== false;
  const sort = timestamps ? ['createdAt', 'id'] : 'id';
  const segments = path.split('.');
  const unnumbered: Where = { or: [{ [path]: { exists: false } }, { [path]: { equals: null } }] };
  const where: Where = scope
    ? {
        and: [
          unnumbered,
          { [scope.path]: { exists: true } },
          { [scope.path]: { not_equals: null } },
        ],
      }
    : unnumbered;

  const scopes = new Map<string, { id: DocID; value: number }>();
  let value = scope ? 0 : await highestAutonumber({ ...entry, db });

  const nextValue = async (doc: NumberedDoc): Promise<number> => {
    if (!scope) return (value += 1);

    const id = scopeIDOf(valueAt(doc, scope.path))!;
    const counter = scopes.get(String(id)) ?? {
      id,
      value: await highestAutonumber({ ...entry, db, scopeID: id }),
    };

    counter.value += 1;
    scopes.set(String(id), counter);

    return counter.value;
  };

  for (;;) {
    const { docs } = await db.find({
      collection,
      where,
      sort,
      limit: PAGE_SIZE,
      pagination: false,
    });

    if (!docs.length) break;

    for (const doc of docs as NumberedDoc[]) {
      await db.updateOne({
        collection,
        id: doc.id,
        data: { updatedAt: null, ...withValueAt(doc, segments, await nextValue(doc)) },
      });
    }

    signal.throwIfAborted();
  }

  for (const counter of scopes.values()) {
    const scopeKey = autonumberKey(entry, counter.id);

    await db.upsert({
      collection: AUTONUMBERS_SLUG,
      where: { key: { equals: scopeKey } },
      data: { key: scopeKey, value: counter.value },
    });
  }

  await db.create({ collection: AUTONUMBERS_SLUG, data: { key, value } });
}

export async function ensureAutonumber({
  collection,
  db,
  kv,
  path,
  scope,
}: AutonumberNumberingArgs): Promise<void> {
  const entry = { collection, path, scope };

  await kv.lock(`autonumber:${autonumberKey(entry)}`, LOCK_TTL, ({ signal }) =>
    numberExistingRecords({ ...entry, db, signal }),
  );
}

/** Creates a scope's counter at the scope's highest number, outside any transaction. */
export async function ensureScopeAutonumber({
  db,
  kv,
  req,
  scopeID,
  ...entry
}: AutonumberNumberingArgs & { req?: PayloadRequest; scopeID: DocID }): Promise<void> {
  const key = autonumberKey(entry, scopeID);

  try {
    await kv.lock(`autonumber:${key}`, LOCK_TTL, async () => {
      if (await hasAutonumber({ db, key })) return;

      const value = await highestAutonumber({ ...entry, db, scopeID });

      await db.create({ collection: AUTONUMBERS_SLUG, data: { key, value } });
    });
  } catch (error) {
    if (!(error instanceof KVLockContentionError)) throw error;

    await waitForAutonumber({ ...entry, db, key, req });
  }
}

export async function waitForAutonumber({
  db,
  key,
  req,
  ...entry
}: AutonumberEntry & {
  db: DatabaseAdapter;
  key?: string;
  req?: PayloadRequest;
}): Promise<void> {
  const counter = key ?? autonumberKey(entry);

  for (let waited = 0; waited < WAIT_TIMEOUT; waited += WAIT_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL));

    if (await hasAutonumber({ db, key: counter })) return;
  }

  throw autonumberError({ ...entry, req, message: AUTONUMBER_PENDING_MESSAGE });
}

export function formatAutonumberKey(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}

export async function readAutonumberPrefix({
  db,
  entry,
  req,
  scopeID,
}: {
  db: DatabaseAdapter;
  entry: AutonumberKeyEntry;
  req?: PayloadRequest;
  scopeID: DocID;
}): Promise<string | undefined> {
  const scope = await db.findOne({
    collection: entry.prefix.collection,
    where: { id: { equals: scopeID } },
    req,
  });

  const prefix = valueAt(scope, entry.prefix.path);

  return typeof prefix === 'string' && prefix ? prefix : undefined;
}

/** Keeps a key the record no longer holds, so `findByAutonumberKey` still finds the record. */
export async function rememberAutonumberKey({
  db,
  entry,
  key,
  record,
  req,
}: {
  db: DatabaseAdapter;
  entry: AutonumberKeyEntry;
  key: string;
  record: DocID;
  req?: PayloadRequest;
}): Promise<void> {
  const now = new Date().toISOString();

  await db.create({
    collection: AUTONUMBER_KEYS_SLUG,
    data: {
      collection: entry.collection,
      path: entry.path,
      key,
      record: String(record),
      createdAt: now,
      updatedAt: now,
    },
    req,
  });
}

async function writeAutonumberKey({
  db,
  doc,
  entry,
  key,
  req,
}: {
  db: DatabaseAdapter;
  doc: NumberedDoc;
  entry: AutonumberKeyEntry;
  key: string;
  req?: PayloadRequest;
}): Promise<void> {
  await db.updateOne({
    collection: entry.collection,
    id: doc.id,
    data: { updatedAt: null, ...withValueAt(doc, entry.path.split('.'), key) },
    req,
  });
}

/**
 * Rewrites every key in one scope after its prefix changed, keeping each old key.
 * Runs with `req`, so inside a transaction a failure rolls the rename back.
 */
export async function rekeyAutonumberScope({
  db,
  entry,
  prefix,
  req,
  scopeID,
}: {
  db: DatabaseAdapter;
  entry: AutonumberKeyEntry;
  prefix: string;
  req?: PayloadRequest;
  scopeID: DocID;
}): Promise<void> {
  for (let page = 1; ; page += 1) {
    const { docs, hasNextPage } = await db.find({
      collection: entry.collection,
      where: { [entry.number.scope.path]: { equals: scopeID } },
      sort: 'id',
      limit: PAGE_SIZE,
      page,
      pagination: true,
      req,
    });

    for (const doc of docs as NumberedDoc[]) {
      const number = numberAt(doc, entry.number.path);

      if (number === undefined) continue;

      const key = formatAutonumberKey(prefix, number);
      const previous = valueAt(doc, entry.path);

      if (previous === key) continue;

      await writeAutonumberKey({ db, doc, entry, key, req });

      if (typeof previous === 'string') {
        await rememberAutonumberKey({ db, entry, key: previous, record: doc.id, req });
      }
    }

    if (!hasNextPage) return;
  }
}

async function keyExistingRecords({
  db,
  entry,
}: {
  db: DatabaseAdapter;
  entry: AutonumberKeyEntry;
}): Promise<void> {
  const prefixes = new Map<string, string | undefined>();
  const where: Where = {
    and: [
      { or: [{ [entry.path]: { exists: false } }, { [entry.path]: { equals: null } }] },
      { [entry.number.path]: { exists: true } },
      { [entry.number.path]: { not_equals: null } },
    ],
  };

  for (;;) {
    const { docs } = await db.find({
      collection: entry.collection,
      where,
      sort: 'id',
      limit: PAGE_SIZE,
      pagination: false,
    });

    let written = 0;

    for (const doc of docs as NumberedDoc[]) {
      const number = numberAt(doc, entry.number.path);
      const scopeID = scopeIDOf(valueAt(doc, entry.number.scope.path));

      if (number === undefined || scopeID === undefined) continue;

      if (!prefixes.has(String(scopeID))) {
        prefixes.set(String(scopeID), await readAutonumberPrefix({ db, entry, scopeID }));
      }

      const prefix = prefixes.get(String(scopeID));

      if (prefix === undefined) continue;

      await writeAutonumberKey({ db, doc, entry, key: formatAutonumberKey(prefix, number) });
      written += 1;
    }

    if (!written) return;
  }
}

export async function ensureAutonumbers(frogbot: FrogBot): Promise<void> {
  for (const target of frogbot.config._internal.autonumbers) {
    const key = autonumberKey(target);

    try {
      if (await hasAutonumber({ db: frogbot.db, key })) continue;

      await ensureAutonumber({ ...target, db: frogbot.db, kv: frogbot.kv });
    } catch (error) {
      if (error instanceof KVLockContentionError) continue;

      frogbot.logger.warn(
        `[frogbot] Autonumber numbering failed for '${key}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const entry of frogbot.config._internal.autonumberKeys) {
    try {
      await keyExistingRecords({ db: frogbot.db, entry });
    } catch (error) {
      frogbot.logger.warn(
        `[frogbot] Autonumber keys failed for '${entry.collection}.${entry.path}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
