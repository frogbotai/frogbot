import type { FieldAccess } from '../../../collections/config/types.js';
import { KVLockContentionError } from '../../../kv/errors.js';
import { toPayloadRequest } from '../../../seams/request.js';
import type { FieldHook, NumberField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { rejectFieldOptions } from '../rejectFieldOptions.js';
import {
  AUTONUMBER_PENDING_MESSAGE,
  autonumberError,
  autonumberKey,
  ensureAutonumber,
  hasAutonumber,
  nextAutonumber,
  raiseAutonumber,
  storedAutonumber,
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
};

const assignAutonumber: FieldHook = async ({
  collection,
  field,
  operation,
  originalDoc,
  path,
  previousValue,
  req,
  siblingData,
  value,
}) => {
  const payloadReq = toPayloadRequest(req);

  if (operation !== 'create') {
    if (typeof previousValue === 'number') return previousValue;

    const id = (originalDoc as { id?: number | string } | undefined)?.id;

    const stored =
      id === undefined
        ? undefined
        : await storedAutonumber({
            collection: collection!.slug,
            db: req.frogbot.db,
            id,
            path: path.join('.'),
            req: payloadReq,
          });

    if (stored !== undefined) return stored;

    delete siblingData[field.name];

    return undefined;
  }

  const target = { collection: collection!.slug, path: path.join('.') };
  const key = autonumberKey(target);
  const { db, kv } = req.frogbot;
  const joined = db.name !== 'mongoose' && Boolean(await payloadReq.transactionID);
  const counter = { db, key, req: joined ? payloadReq : undefined };

  const invalid = (message: string) => autonumberError({ ...target, message, req: payloadReq });

  const ensureCounter = async () => {
    if (await hasAutonumber(counter)) return;

    if (joined) throw invalid(AUTONUMBER_PENDING_MESSAGE);

    try {
      await ensureAutonumber({ ...target, db, kv });
    } catch (error) {
      if (!(error instanceof KVLockContentionError)) throw error;

      await waitForAutonumber({ ...target, db, req: payloadReq });
    }
  };

  if (value !== undefined && value !== null) {
    if (!Number.isSafeInteger(value) || value < 1) {
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
};

const clearOnDuplicate: FieldHook = () => undefined;

export function autonumberField(args: AutonumberFieldArgs): NumberField {
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
      unique: true,
      admin: { ...args.admin, readOnly: true },
      access: {
        ...(read ? { read } : {}),
        create: () => false,
        update: () => false,
      },
      hooks: {
        ...args.hooks,
        beforeChange: [assignAutonumber, ...(args.hooks?.beforeChange ?? [])],
        beforeDuplicate: [clearOnDuplicate, ...(args.hooks?.beforeDuplicate ?? [])],
      },
    },
    {
      kind: { type: 'autonumber' },
      description: 'Unique number set by FrogBot when the record is created; read-only',
      integer: true,
    },
  );
}
