import type { DocID, FieldAccess } from '../../../collections/config/types.js';
import type { AutonumberEntry } from '../../../config/sanitized.js';
import { insertIfMissing } from '../../../database/insertIfMissing.js';
import { KVLockContentionError } from '../../../kv/errors.js';
import type { KV } from '../../../kv/types.js';
import { toPayloadRequest } from '../../../seams/request.js';
import type { PayloadRequest } from '../../../types/payload.js';
import type { FrogBotRequest } from '../../../types/request.js';
import type { FieldHook, NumberField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { rejectFieldOptions } from '../rejectFieldOptions.js';
import { AUTONUMBERS_SLUG } from './collection.js';
import {
  AUTONUMBER_PENDING_MESSAGE,
  autonumberError,
  autonumberKey,
  ensureAutonumber,
  ensureScopeAutonumber,
  hasAutonumber,
  highestAutonumber,
  nextAutonumber,
  numberAt,
  raiseAutonumber,
  scopeIDOf,
  storedRecord,
  valueAt,
  waitForAutonumber,
} from './counter.js';

type SingleNumberField = Extract<NumberField, { hasMany?: false | undefined }>;

export type AutonumberFieldArgs = Omit<
  SingleNumberField,
  | 'access'
  | 'defaultValue'
  | 'hasMany'
  | 'localized'
  | 'maxRows'
  | 'minRows'
  | 'required'
  | 'type'
  | 'unique'
  | 'virtual'
> & {
  access?: { read?: FieldAccess };
  /**
   * A sibling relationship field. Each related record has its own count from 1,
   * so the number is unique within each scope rather than across the collection.
   */
  scope?: string;
};

type Numbering = {
  db: FrogBotRequest['frogbot']['db'];
  entry: AutonumberEntry;
  joined: boolean;
  kv: KV;
  req: PayloadRequest;
  scopeID?: DocID;
};

async function assignNumber(
  { db, entry, joined, kv, req, scopeID }: Numbering,
  value: unknown,
): Promise<number> {
  const key = autonumberKey(entry, scopeID);
  const marker = autonumberKey(entry);
  const counter = { db, key, req: joined ? req : undefined };

  const invalid = (message: string) => autonumberError({ ...entry, message, req });

  const ensureCounter = async () => {
    if (await hasAutonumber(counter)) return;

    if (joined) {
      if (key === marker || !(await hasAutonumber({ ...counter, key: marker }))) {
        throw invalid(AUTONUMBER_PENDING_MESSAGE);
      }

      const highest = await highestAutonumber({ ...entry, db, req, scopeID });

      await insertIfMissing({
        req,
        collection: AUTONUMBERS_SLUG,
        data: { key, value: highest },
        target: 'key',
      });

      return;
    }

    if (key === marker || !(await hasAutonumber({ db, key: marker }))) {
      try {
        await ensureAutonumber({ ...entry, db, kv });
      } catch (error) {
        if (!(error instanceof KVLockContentionError)) throw error;

        await waitForAutonumber({ ...entry, db, req });
      }
    }

    if (scopeID !== undefined) await ensureScopeAutonumber({ ...entry, db, kv, req, scopeID });
  };

  if (value !== undefined && value !== null) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
      throw invalid('Autonumber values must be whole numbers of 1 or more.');
    }

    if (await raiseAutonumber({ ...counter, value })) return value;

    if (!(await hasAutonumber(counter))) {
      await ensureCounter();
      await raiseAutonumber({ ...counter, value });
    }

    return value;
  }

  const next = await nextAutonumber(counter);

  if (next !== null) return next;

  await ensureCounter();

  const retried = await nextAutonumber(counter);

  if (retried === null) throw invalid('No number could be assigned. Try again in a moment.');

  return retried;
}

export type AutonumberAssignment = {
  /** Missing only outside a collection, where the number is never assigned. */
  collection: string | undefined;
  name: string;
  operation: string | undefined;
  originalDoc: unknown;
  path: (number | string)[];
  previousValue: unknown;
  req: FrogBotRequest;
  scope: string | undefined;
  siblingData: Record<string, unknown>;
  value: unknown;
};

async function assignAutonumber({
  collection,
  name,
  operation,
  originalDoc,
  path,
  previousValue,
  req,
  scope,
  siblingData,
  value,
}: AutonumberAssignment): Promise<number | undefined> {
  const payloadReq = toPayloadRequest(req);
  const id = (originalDoc as { id?: DocID } | undefined)?.id;

  const unset = () => {
    delete siblingData[name];

    return undefined;
  };

  if (!scope && operation !== 'create') {
    if (typeof previousValue === 'number') return previousValue;

    const stored =
      id === undefined
        ? undefined
        : numberAt(
            await storedRecord({
              collection: collection!,
              db: req.frogbot.db,
              id,
              req: payloadReq,
            }),
            path.join('.'),
          );

    return stored ?? unset();
  }

  const entry: AutonumberEntry = {
    collection: collection!,
    path: path.join('.'),
    ...(scope ? { scope: { name: scope, path: [...path.slice(0, -1), scope].join('.') } } : {}),
  };

  if (!entry.scope) return assignNumber(await numbering({ entry, req }), value);

  const scopePath = entry.scope.path;
  const incoming = siblingData[scope!];
  const scopeID = scopeIDOf(incoming === undefined ? valueAt(originalDoc, scopePath) : incoming);

  if (scopeID === undefined) {
    return operation === 'create' ? unset() : ((previousValue as number | undefined) ?? unset());
  }

  const counters = await numbering({ entry, req, scopeID });

  if (operation === 'create') return assignNumber(counters, value);

  let number = typeof previousValue === 'number' ? previousValue : undefined;
  let from = scopeIDOf(valueAt(originalDoc, scopePath));

  if (number === undefined && id !== undefined) {
    const stored = await storedRecord({ ...entry, db: counters.db, id, req: payloadReq });

    number = numberAt(stored, entry.path);
    from = scopeIDOf(valueAt(stored, scopePath));
  }

  if (number !== undefined && String(from) === String(scopeID)) return number;

  if (
    number === undefined &&
    !(await hasAutonumber({
      db: counters.db,
      key: autonumberKey(entry),
      req: counters.joined ? payloadReq : undefined,
    }))
  ) {
    return unset();
  }

  return assignNumber(counters, undefined);
}

const assignments = new WeakMap<object, Map<string, Promise<number | undefined>>>();

/**
 * Payload runs the field hooks of one level in parallel, so a number and its
 * `autonumberKeyField` share one assignment per save, keyed on the sibling data.
 */
export function sharedAutonumber(args: AutonumberAssignment): Promise<number | undefined> {
  const { name, siblingData } = args;

  if (siblingData === null || typeof siblingData !== 'object') return assignAutonumber(args);

  let byName = assignments.get(siblingData);

  if (!byName) {
    byName = new Map();
    assignments.set(siblingData, byName);
  }

  let assigned = byName.get(name);

  if (!assigned) {
    assigned = assignAutonumber(args);
    byName.set(name, assigned);
  }

  return assigned;
}

function autonumberHook(scope: string | undefined): FieldHook {
  return ({
    collection,
    field,
    operation,
    originalDoc,
    path,
    previousValue,
    req,
    siblingData,
    value,
  }) =>
    sharedAutonumber({
      collection: collection?.slug,
      name: field.name,
      operation,
      originalDoc,
      path,
      previousValue,
      req,
      scope,
      siblingData,
      value,
    });
}

async function numbering({
  entry,
  req,
  scopeID,
}: {
  entry: AutonumberEntry;
  req: FrogBotRequest;
  scopeID?: DocID;
}): Promise<Numbering> {
  const { db, kv } = req.frogbot;
  const payloadReq = toPayloadRequest(req);
  const joined = db.name !== 'mongoose' && Boolean(await payloadReq.transactionID);

  return { db, entry, joined, kv, req: payloadReq, ...(scopeID !== undefined ? { scopeID } : {}) };
}

const clearOnDuplicate: FieldHook = () => undefined;

export function autonumberField({ scope, ...args }: AutonumberFieldArgs): NumberField {
  rejectFieldOptions({
    factory: 'autonumberField',
    field: args,
    keys: [
      'hasMany',
      'minRows',
      'maxRows',
      'localized',
      'defaultValue',
      'required',
      'unique',
      'virtual',
      'access.create',
      'access.update',
    ],
  });

  const read = args.access?.read;

  return applyFieldKind(
    {
      ...args,
      type: 'number',
      unique: !scope,
      admin: { ...args.admin, readOnly: true },
      access: {
        ...(read ? { read } : {}),
        create: () => false,
        update: () => false,
      },
      hooks: {
        ...args.hooks,
        beforeChange: [autonumberHook(scope), ...(args.hooks?.beforeChange ?? [])],
        beforeDuplicate: [clearOnDuplicate, ...(args.hooks?.beforeDuplicate ?? [])],
      },
    },
    {
      kind: { type: 'autonumber', ...(scope ? { scope } : {}) },
      description: scope
        ? `Number set by FrogBot when the record is created, unique within each ${scope}; read-only`
        : 'Unique number set by FrogBot when the record is created; read-only',
      integer: true,
    },
  );
}
