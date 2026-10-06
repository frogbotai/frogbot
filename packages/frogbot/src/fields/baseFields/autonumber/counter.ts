import {
  type BaseDatabaseAdapter,
  type DatabaseAdapter,
  type PayloadRequest,
  ValidationError,
} from 'payload';

import type { AutonumberEntry } from '../../../config/sanitized.js';
import type { FrogBot } from '../../../frogbot.js';
import { KVLockContentionError } from '../../../kv/errors.js';
import type { KV } from '../../../kv/types.js';
import { AUTONUMBERS_SLUG } from './collection.js';

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

export function autonumberKey({ collection, path }: AutonumberEntry): string {
  return `${collection}.${path}`;
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

function valueAt(doc: unknown, path: string): unknown {
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
  value: number,
): Record<string, unknown> {
  if (!rest.length) return { [name]: value };

  const group = doc[name];
  const sibling = (group !== null && typeof group === 'object' ? group : {}) as Record<
    string,
    unknown
  >;

  return { [name]: { ...sibling, ...withValueAt(sibling, rest, value) } };
}

export async function storedAutonumber({
  collection,
  db,
  id,
  path,
  req,
}: AutonumberEntry & {
  db: DatabaseAdapter;
  id: number | string;
  req?: PayloadRequest;
}): Promise<number | undefined> {
  const doc = await db.findOne({ collection, where: { id: { equals: id } }, req });
  const value = valueAt(doc, path);

  return typeof value === 'number' ? value : undefined;
}

async function highestAutonumber({
  collection,
  db,
  path,
}: AutonumberEntry & { db: DatabaseAdapter }): Promise<number> {
  const { docs } = await db.find({
    collection,
    where: { and: [{ [path]: { exists: true } }, { [path]: { not_equals: null } }] },
    sort: `-${path}`,
    limit: 1,
    pagination: false,
  });

  const highest = valueAt(docs[0], path);

  return typeof highest === 'number' ? highest : 0;
}

async function numberExistingRecords({
  collection,
  db,
  path,
  signal,
}: AutonumberEntry & { db: DatabaseAdapter; signal: AbortSignal }): Promise<void> {
  const key = autonumberKey({ collection, path });

  if (await hasAutonumber({ db, key })) return;

  const timestamps = db.payload.collections[collection]?.config.timestamps !== false;
  const sort = timestamps ? ['createdAt', 'id'] : 'id';
  const segments = path.split('.');

  let value = await highestAutonumber({ collection, db, path });

  for (;;) {
    const { docs } = await db.find({
      collection,
      where: { or: [{ [path]: { exists: false } }, { [path]: { equals: null } }] },
      sort,
      limit: PAGE_SIZE,
      pagination: false,
    });

    if (!docs.length) break;

    for (const doc of docs as NumberedDoc[]) {
      value += 1;

      await db.updateOne({
        collection,
        id: doc.id,
        data: { updatedAt: null, ...withValueAt(doc, segments, value) },
      });
    }

    signal.throwIfAborted();
  }

  await db.create({ collection: AUTONUMBERS_SLUG, data: { key, value } });
}

export async function ensureAutonumber({
  collection,
  db,
  kv,
  path,
}: AutonumberNumberingArgs): Promise<void> {
  const key = autonumberKey({ collection, path });

  await kv.lock(`autonumber:${key}`, LOCK_TTL, ({ signal }) =>
    numberExistingRecords({ collection, db, path, signal }),
  );
}

export async function waitForAutonumber({
  collection,
  db,
  path,
  req,
}: AutonumberEntry & { db: DatabaseAdapter; req?: PayloadRequest }): Promise<void> {
  const key = autonumberKey({ collection, path });

  for (let waited = 0; waited < WAIT_TIMEOUT; waited += WAIT_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL));

    if (await hasAutonumber({ db, key })) return;
  }

  throw autonumberError({ collection, path, req, message: AUTONUMBER_PENDING_MESSAGE });
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
}
