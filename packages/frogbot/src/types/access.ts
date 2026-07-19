// Frogbot's access control types.
//
// Same shape as Payload's but with `FrogbotRequest`. Users write access
// functions against these; sanitize() wraps them for Payload at runtime.

import type { TypeWithID } from 'payload';

import type { Where } from './payload.js';
import type { FrogbotRequest } from './request.js';

export type AccessResult = boolean | Where;

export type AccessArgs<TData = any> = {
  data?: TData;
  id?: number | string;
  isReadingStaticFile?: boolean;
  req: FrogbotRequest;
};

export type Access<TData = any> = (
  args: AccessArgs<TData>,
) => AccessResult | Promise<AccessResult>;

export type CollectionAccess = {
  admin?: (args: { req: FrogbotRequest }) => boolean | Promise<boolean>;
  create?: Access;
  delete?: Access;
  read?: Access;
  readVersions?: Access;
  unlock?: Access;
  update?: Access;
};

// ── Field-level access ────────────────────────────────────────────────

export type FieldAccessArgs<TData extends TypeWithID = any, TSiblingData = any> = {
  data?: Partial<TData>;
  doc?: TData;
  id?: number | string;
  req: FrogbotRequest;
  siblingData?: Partial<TSiblingData>;
};

export type FieldAccess<TData extends TypeWithID = any, TSiblingData = any> = (
  args: FieldAccessArgs<TData, TSiblingData>,
) => boolean | Promise<boolean>;
