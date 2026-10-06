import type { FieldAccess } from '../../collections/config/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import type { FieldHook, RelationshipField } from '../config/types.js';
import { applyFieldKind } from './applyFieldKind.js';
import { rejectFieldOptions } from './rejectFieldOptions.js';

type SingleRelationshipField = Extract<
  RelationshipField,
  { hasMany?: false | undefined; relationTo: string }
>;

export type UserKindFieldArgs = Omit<
  SingleRelationshipField,
  | 'access'
  | 'defaultValue'
  | 'hasMany'
  | 'localized'
  | 'maxRows'
  | 'minRows'
  | 'relationTo'
  | 'required'
  | 'type'
  | 'virtual'
> & {
  access?: { read?: FieldAccess };
  relationTo?: SingleRelationshipField['relationTo'];
};

type RelationshipID = number | string;

export type UserKindSpec = {
  factory: string;
  type: 'createdBy' | 'lastModifiedBy';
  description: string;
  beforeChange: FieldHook;
};

const REJECTED_OPTIONS = [
  'hasMany',
  'minRows',
  'maxRows',
  'localized',
  'defaultValue',
  'required',
  'virtual',
  'access.create',
  'access.update',
];

function isID(value: unknown): value is RelationshipID {
  return typeof value === 'string' || typeof value === 'number';
}

export function relationshipID(value: unknown): RelationshipID | null {
  if (isID(value)) return value;

  if (value !== null && typeof value === 'object' && 'id' in value && isID(value.id)) {
    return value.id;
  }

  return null;
}

export function requestUserID({
  relationTo,
  req,
}: {
  relationTo: unknown;
  req: Pick<FrogBotRequest, 'user'>;
}): RelationshipID | null {
  const user = req.user as { collection?: unknown; id?: unknown } | null | undefined;

  if (!user || user.collection !== relationTo) return null;

  return isID(user.id) ? user.id : null;
}

export function fieldRelationTo(field: object): unknown {
  return 'relationTo' in field ? field.relationTo : undefined;
}

const clearOnDuplicate: FieldHook = () => undefined;

export function buildUserKindField(args: UserKindFieldArgs, spec: UserKindSpec): RelationshipField {
  rejectFieldOptions({ factory: spec.factory, field: args, keys: REJECTED_OPTIONS });

  if (args.relationTo !== undefined && typeof args.relationTo !== 'string') {
    throw new Error(`${spec.factory} "${args.name}": relationTo must be one collection slug`);
  }

  const read = args.access?.read;

  const field = {
    ...args,
    type: 'relationship',
    admin: { ...args.admin, readOnly: true },
    access: {
      ...(read ? { read } : {}),
      create: () => false,
      update: () => false,
    },
    hooks: {
      ...args.hooks,
      beforeChange: [spec.beforeChange, ...(args.hooks?.beforeChange ?? [])],
      beforeDuplicate: [clearOnDuplicate, ...(args.hooks?.beforeDuplicate ?? [])],
    },
  } as SingleRelationshipField;

  return applyFieldKind(field, { kind: { type: spec.type }, description: spec.description });
}
