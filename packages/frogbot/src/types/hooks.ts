// Frogbot's collection hook types.
//
// Same shape as Payload's hooks but with `FrogbotRequest` instead of
// `PayloadRequest`. Users write hooks against these types; at runtime,
// sanitize() wraps them so Payload sees PayloadRequest-compatible functions.

import type { RequestContext, SanitizedCollectionConfig, TypeWithID } from 'payload';

import type { FrogbotRequest } from './request.js';

type CreateOrUpdateOperation = 'create' | 'update';

export type BeforeValidateHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  data?: Partial<T>;
  operation: CreateOrUpdateOperation;
  originalDoc?: T;
  req: FrogbotRequest;
}) => any;

export type BeforeChangeHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  data: Partial<T>;
  operation: CreateOrUpdateOperation;
  originalDoc?: T;
  req: FrogbotRequest;
}) => any;

export type AfterChangeHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  data: Partial<T>;
  doc: T;
  operation: CreateOrUpdateOperation;
  overrideAccess?: boolean;
  previousDoc: T;
  req: FrogbotRequest;
}) => any;

export type BeforeReadHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  doc: T;
  overrideAccess?: boolean;
  query: { [key: string]: any };
  req: FrogbotRequest;
}) => any;

export type AfterReadHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  doc: T;
  findMany?: boolean;
  overrideAccess?: boolean;
  query?: { [key: string]: any };
  req: FrogbotRequest;
}) => any;

export type BeforeDeleteHook = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  id: number | string;
  req: FrogbotRequest;
}) => any;

export type AfterDeleteHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  doc: T;
  id: number | string;
  req: FrogbotRequest;
}) => any;

// ── Auth hooks ────────────────────────────────────────────────────────

export type BeforeLoginHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  req: FrogbotRequest;
  user: T;
}) => any;

export type AfterLoginHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  req: FrogbotRequest;
  token: string;
  user: T;
}) => any;

export type AfterLogoutHook<_T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  req: FrogbotRequest;
}) => any;

export type AfterForgotPasswordHook = (args: {
  args: unknown;
  collection: SanitizedCollectionConfig;
  context: RequestContext;
}) => any;

export type RefreshHook<T extends TypeWithID = any> = (args: {
  exp: number;
  req: FrogbotRequest;
  token: string;
  user: T;
}) => any;

export type MeHook<T extends TypeWithID = any> = (args: {
  req: FrogbotRequest;
  user: T;
}) => any;

export type CollectionHooks<T extends TypeWithID = any> = {
  afterChange?: AfterChangeHook<T>[];
  afterDelete?: AfterDeleteHook<T>[];
  afterRead?: AfterReadHook<T>[];
  beforeChange?: BeforeChangeHook<T>[];
  beforeDelete?: BeforeDeleteHook[];
  beforeRead?: BeforeReadHook<T>[];
  beforeValidate?: BeforeValidateHook<T>[];
  // Auth hooks (only relevant for auth-enabled collections)
  afterLogin?: AfterLoginHook<T>[];
  beforeLogin?: BeforeLoginHook<T>[];
  afterLogout?: AfterLogoutHook<T>[];
  afterForgotPassword?: AfterForgotPasswordHook[];
  refresh?: RefreshHook<T>[];
  me?: MeHook<T>[];
};


