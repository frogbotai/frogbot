// Frogbot's Field type.
//
// Uses a distributive Omit to strip Payload's `hooks`, `access`, and
// `validate` from every variant in the Field union, then intersects with
// frogbot's own shapes. The result: users get frogbot's FieldHook,
// FieldAccess, and Validate types everywhere, with no Payload type leakage.

import type {
  Field as PayloadField,
  RequestContext,
  SanitizedCollectionConfig,
  TypeWithID,
} from 'payload';

import type { FieldAccess } from './access.js';
import type { FrogbotRequest } from './request.js';

// ── Field hook ────────────────────────────────────────────────────────

export type FieldHookArgs<
  TData extends TypeWithID = any,
  TValue = any,
  TSiblingData = any,
> = {
  collection: null | SanitizedCollectionConfig;
  context: RequestContext;
  data?: Partial<TData>;
  field: any;
  operation?: 'create' | 'delete' | 'read' | 'update';
  originalDoc?: TData;
  overrideAccess?: boolean;
  previousDoc?: TData;
  previousSiblingDoc?: TSiblingData;
  previousValue?: TValue;
  req: FrogbotRequest;
  siblingData: Partial<TSiblingData>;
  value?: TValue;
};

export type FieldHook<
  TData extends TypeWithID = any,
  TValue = any,
  TSiblingData = any,
> = (args: FieldHookArgs<TData, TValue, TSiblingData>) => Promise<TValue> | TValue;

// ── Validate ──────────────────────────────────────────────────────────

export type ValidateOptions<TData = any, TSiblingData = any, TValue = any> = {
  data: Partial<TData>;
  event?: 'onChange' | 'submit';
  id?: number | string;
  operation?: 'create' | 'update';
  path: (number | string)[];
  previousValue?: TValue;
  req: FrogbotRequest;
  required?: boolean;
  siblingData: Partial<TSiblingData>;
};

export type Validate<
  TValue = any,
  TData = any,
  TSiblingData = any,
> = (
  value: null | TValue | undefined,
  options: ValidateOptions<TData, TSiblingData, TValue>,
) => Promise<string | true> | string | true;

// ── Field type (distributive swap) ────────────────────────────────────

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

type FieldHooks = {
  hooks?: {
    afterChange?: FieldHook[];
    afterRead?: FieldHook[];
    beforeChange?: FieldHook[];
    beforeDuplicate?: FieldHook[];
    beforeValidate?: FieldHook[];
  };
};

type FieldAccessConfig = {
  access?: {
    create?: FieldAccess;
    read?: FieldAccess;
    update?: FieldAccess;
  };
};

type FieldValidateConfig = {
  validate?: Validate;
};

export type Field = DistributiveOmit<PayloadField, 'hooks' | 'access' | 'validate'> &
  FieldHooks &
  FieldAccessConfig &
  FieldValidateConfig;
