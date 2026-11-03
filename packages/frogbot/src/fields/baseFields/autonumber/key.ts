import { type FlattenedField, getFieldByPath } from 'payload';

import type { DocID, FieldAccess } from '../../../collections/config/types.js';
import type {
  AutonumberEntry,
  AutonumberKeyDeclaration,
  AutonumberKeyEntry,
} from '../../../config/sanitized.js';
import { toPayloadRequest } from '../../../seams/request.js';
import type { PayloadRequest } from '../../../types/payload.js';
import type { FieldHook, TextField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { rejectFieldOptions } from '../rejectFieldOptions.js';
import { AUTONUMBER_KEYS_SLUG } from './collection.js';
import {
  formatAutonumberKey,
  readAutonumberPrefix,
  rekeyAutonumberScope,
  rememberAutonumberKey,
  scopeIDOf,
  valueAt,
} from './counter.js';
import { sharedAutonumber } from './index.js';

type SingleTextField = Extract<TextField, { hasMany?: false | undefined }>;

export type AutonumberKeyFieldArgs = Omit<
  SingleTextField,
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
  /** A sibling `autonumberField` with a `scope`. */
  number: string;
  /** A required, unique text field on the scope's collection, such as a project's `key`. */
  prefix: string;
};

type BuiltCollection = {
  slug: string;
  flattenedFields: FlattenedField[];
  hooks: { afterChange?: unknown[]; afterDelete?: unknown[] };
};

type RekeyArgs = {
  doc: Record<string, unknown> & { id: DocID };
  operation: string;
  previousDoc: Record<string, unknown>;
  req: PayloadRequest;
};

const assignKey: FieldHook = async ({
  collection,
  field,
  operation,
  originalDoc,
  path,
  previousSiblingDoc,
  previousValue,
  req,
  siblingData,
}) => {
  const unset = () => {
    delete siblingData[field.name];

    return undefined;
  };

  const keyPath = path.join('.');
  const entry = req.frogbot.config._internal.autonumberKeys.find(
    (candidate) => candidate.collection === collection?.slug && candidate.path === keyPath,
  );

  if (!entry) return unset();

  const { scope } = entry.number;
  const name = entry.number.path.split('.').at(-1)!;
  const previous = typeof previousValue === 'string' ? previousValue : undefined;

  const number = await sharedAutonumber({
    collection: entry.collection,
    name,
    operation,
    originalDoc,
    path: [...path.slice(0, -1), name],
    previousValue: (previousSiblingDoc as Record<string, unknown> | undefined)?.[name],
    req,
    scope: scope.name,
    siblingData,
    value: siblingData[name],
  });

  const keep = () => (operation === 'create' ? unset() : (previous ?? unset()));

  if (number === undefined) return keep();

  const incoming = siblingData[scope.name];
  const scopeID = scopeIDOf(incoming === undefined ? valueAt(originalDoc, scope.path) : incoming);

  if (scopeID === undefined) return keep();

  const payloadReq = toPayloadRequest(req);
  const db = req.frogbot.db;
  const prefix = await readAutonumberPrefix({ db, entry, req: payloadReq, scopeID });

  if (prefix === undefined) return keep();

  const key = formatAutonumberKey(prefix, number);
  const id = (originalDoc as { id?: DocID } | undefined)?.id;

  if (operation !== 'create' && previous && previous !== key && id !== undefined) {
    await rememberAutonumberKey({ db, entry, key: previous, record: id, req: payloadReq });
  }

  return key;
};

const clearOnDuplicate: FieldHook = () => undefined;

/**
 * A read-only text key such as `APP-123`, built from a scoped `autonumberField`
 * and a prefix on the scope's record. Stored, so it filters, sorts, searches and
 * can be the title.
 */
export function autonumberKeyField({ number, prefix, ...args }: AutonumberKeyFieldArgs): TextField {
  rejectFieldOptions({
    factory: 'autonumberKeyField',
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
      type: 'text',
      unique: true,
      admin: { ...args.admin, readOnly: true },
      access: {
        ...(read ? { read } : {}),
        create: () => false,
        update: () => false,
      },
      hooks: {
        ...args.hooks,
        beforeChange: [assignKey, ...(args.hooks?.beforeChange ?? [])],
        beforeDuplicate: [clearOnDuplicate, ...(args.hooks?.beforeDuplicate ?? [])],
      },
    },
    {
      kind: { type: 'autonumberKey', number, prefix },
      description: `Unique key set by FrogBot as <${prefix}>-<${number}>, like APP-123; read-only`,
    },
  );
}

function scopedNumber({
  autonumbers,
  declaration,
}: {
  autonumbers: AutonumberEntry[];
  declaration: AutonumberKeyDeclaration;
}): AutonumberKeyEntry['number'] {
  const entry = autonumbers.find(
    ({ collection, path }) =>
      collection === declaration.collection && path === declaration.number.path,
  );

  if (!entry?.scope) {
    throw new Error(
      `[frogbot] Autonumber key field '${declaration.path}' in collection '${declaration.collection}' has number '${declaration.number.name}', which must be an autonumberField with a scope beside it.`,
    );
  }

  return { ...entry, scope: entry.scope };
}

function prefixCollection({
  collections,
  declaration,
  number,
}: {
  collections: BuiltCollection[];
  declaration: AutonumberKeyDeclaration;
  number: AutonumberKeyEntry['number'];
}): string {
  const fields = collections.find(({ slug }) => slug === declaration.collection)?.flattenedFields;
  const scope = fields && getFieldByPath({ fields, path: number.scope.path })?.field;
  const relationTo = scope?.type === 'relationship' ? scope.relationTo : undefined;

  if (typeof relationTo !== 'string') {
    throw new Error(
      `[frogbot] Autonumber key field '${declaration.path}' in collection '${declaration.collection}' has number '${declaration.number.name}', whose scope is not a relationship to one collection.`,
    );
  }

  const target = collections.find(({ slug }) => slug === relationTo);
  const found =
    target && getFieldByPath({ fields: target.flattenedFields, path: declaration.prefix });

  const field = found?.field;

  if (
    field?.type !== 'text' ||
    !field.required ||
    !field.unique ||
    field.hasMany ||
    found!.pathHasLocalized
  ) {
    throw new Error(
      `[frogbot] Autonumber key field '${declaration.path}' in collection '${declaration.collection}' has prefix '${declaration.prefix}', which must be a required, unique text field in collection '${relationTo}', not localized or hasMany.`,
    );
  }

  return relationTo;
}

function rekeyHook(entries: AutonumberKeyEntry[]) {
  return async ({ doc, operation, previousDoc, req }: RekeyArgs) => {
    if (operation !== 'update') return doc;

    for (const entry of entries) {
      const prefix = valueAt(doc, entry.prefix.path);

      if (typeof prefix !== 'string' || !prefix) continue;
      if (prefix === valueAt(previousDoc, entry.prefix.path)) continue;

      await rekeyAutonumberScope({ db: req.payload.db, entry, prefix, req, scopeID: doc.id });
    }

    return doc;
  };
}

function forgetKeysHook(collection: string) {
  return async ({ id, req }: { id: DocID; req: PayloadRequest }) => {
    await req.payload.db.deleteMany({
      collection: AUTONUMBER_KEYS_SLUG,
      where: { and: [{ collection: { equals: collection } }, { record: { equals: String(id) } }] },
      req,
    });
  };
}

/**
 * Checks each `autonumberKeyField` against the built config, and makes a prefix
 * change rewrite the keys in that scope. Runs once Payload has built the config,
 * because the prefix lives on another collection.
 */
export function resolveAutonumberKeys({
  autonumbers,
  collections,
  declarations,
}: {
  autonumbers: AutonumberEntry[];
  collections: BuiltCollection[];
  declarations: AutonumberKeyDeclaration[];
}): AutonumberKeyEntry[] {
  const entries = declarations.map((declaration): AutonumberKeyEntry => {
    const number = scopedNumber({ autonumbers, declaration });

    return {
      collection: declaration.collection,
      path: declaration.path,
      number,
      prefix: {
        collection: prefixCollection({ collections, declaration, number }),
        path: declaration.prefix,
      },
    };
  });

  for (const collection of collections) {
    const renamed = entries.filter(({ prefix }) => prefix.collection === collection.slug);

    if (entries.some((entry) => entry.collection === collection.slug)) {
      collection.hooks.afterDelete = [
        ...(collection.hooks.afterDelete ?? []),
        forgetKeysHook(collection.slug),
      ];
    }

    if (!renamed.length) continue;

    collection.hooks.afterChange = [...(collection.hooks.afterChange ?? []), rekeyHook(renamed)];
  }

  return entries;
}
