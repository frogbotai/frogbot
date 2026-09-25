// FrogBot's CollectionConfig — the user-facing authoring shape.
//
// Strategy: extend Payload's CollectionConfig but override hooks, access,
// endpoints, and fields with frogbot's own types (which use FrogBotRequest
// instead of PayloadRequest). Users write hooks against `req.frogbot` —
// sanitize() wraps them for Payload at runtime.
//
// Users import this from `'frogbot'`. They never see the underlying Payload
// type name or import path.

import type { RequestContext, SanitizedCollectionConfig, TypeWithID } from 'payload';

import type { IconName } from '../../admin/icons.js';
import type { FrogBotComponent } from '../../admin/types.js';
import type { CollectionView, DocumentTabConfig } from '../../admin/views/types.js';
import type { AuthConfig } from '../../auth/types.js';
import type { LivePreviewConfig } from '../../config/types.js';
import type { Endpoint } from '../../endpoints/types.js';
import type { Field } from '../../fields/config/types.js';
import type { SearchIndexConfig, SearchIndexDescriptors } from '../../search/types.js';
import type { CollectionSlug, TypedCollection } from '../../types/generated.js';
import type { PayloadCollectionConfig, SelectType, Sort, Where } from '../../types/payload.js';
import type { FrogBotRequest } from '../../types/request.js';

type Overridden = 'auth' | 'hooks' | 'access' | 'endpoints' | 'fields' | 'admin';
type PayloadAdmin = NonNullable<PayloadCollectionConfig['admin']>;
type PayloadComponents = NonNullable<PayloadAdmin['components']>;
type PayloadEditViews = NonNullable<NonNullable<PayloadComponents['views']>['edit']>;

type CollectionDocumentView<TView> = TView extends object
  ? { [K in keyof TView]: K extends 'tab' ? DocumentTabConfig : TView[K] }
  : TView;

type CollectionEditViews<TViews = PayloadEditViews> = TViews extends unknown
  ? { [K in keyof TViews]: CollectionDocumentView<TViews[K]> }
  : never;

export type CollectionAdminComponents = Omit<
  PayloadComponents,
  | 'afterList'
  | 'afterListTable'
  | 'beforeList'
  | 'beforeListTable'
  | 'edit'
  | 'listMenuItems'
  | 'views'
> & {
  edit?: NonNullable<PayloadComponents['edit']> & { views?: CollectionEditViews };
};

export type CollectionAdminConfig = Omit<
  PayloadAdmin,
  | 'baseFilter'
  | 'baseListFilter'
  | 'components'
  | 'defaultColumns'
  | 'defaultSort'
  | 'group'
  | 'listSearchableFields'
  | 'livePreview'
  | 'pagination'
> & {
  components?: CollectionAdminComponents;
  group?: PayloadAdmin['group'] | null;
  icon?: FrogBotComponent | IconName;
  livePreview?: LivePreviewConfig;
  views?: CollectionView[];
};

export type CollectionConfig = Omit<PayloadCollectionConfig, Overridden> & {
  admin?: CollectionAdminConfig;
  /** Per-collection auth. `true` enables FrogBot defaults; object overrides. */
  auth?: boolean | AuthConfig;

  /** Collection hooks. `req` is `FrogBotRequest` with `req.frogbot`. */
  hooks?: CollectionHooks;

  /** Collection-level access control. `req` is `FrogBotRequest`. */
  access?: CollectionAccess;

  /** Custom REST endpoints for this collection. */
  endpoints?: Endpoint[];

  /** Field definitions with frogbot's hook/access types. */
  fields: Field[];

  search?: Record<string, SearchIndexConfig>;

  /** Marks this collection as the chat collection. FrogBot merges
   *  its base chat fields in; the slug stays yours. At most one. */
  chat?: boolean;

  /** Marks this collection as the chat message collection. FrogBot merges
   *  its base message fields in; the slug stays yours. At most one. */
  message?: boolean;

  /** Marks this collection as the files collection. FrogBot merges its base
   *  upload configuration in; the slug stays yours. At most one. */
  file?: boolean;

  /** Marks this collection as the AI usage-log collection. FrogBot merges its
   *  base usage-tracking fields in; the slug stays yours. At most one. */
  usageLog?: boolean;
};

/** Collection markers. Sanitization strips these before Payload. */
export const COLLECTION_MARKERS = ['chat', 'message', 'file', 'usageLog'] as const;
export type CollectionMarker = (typeof COLLECTION_MARKERS)[number];

/**
 * Runtime view of a registered collection. Parallel to `CollectionConfig`
 * (authoring input) vs `Collection` (post-boot reality on the running
 * FrogBot instance). Surfaced via `FrogBotInstance.collections`.
 *
 * Intentionally mirrors Payload's `Collection`/`CollectionConfig` split —
 * same concept, FrogBot vocabulary (simple auth boolean) instead of
 * Payload's sanitized internals.
 */
export type Collection = {
  /** Collection slug. Also the key in `FrogBotInstance.collections`. */
  slug: string;
  /** True if this collection was authored with auth enabled. */
  auth: boolean;
  search?: SearchIndexDescriptors;
};

// FrogBot's access control types.
//
// Same shape as Payload's but with `FrogBotRequest`. Users write access
// functions against these; sanitize() wraps them for Payload at runtime.

export type AccessResult = boolean | Where;

export type AccessArgs<TData = any> = {
  data?: TData;
  id?: number | string;
  isReadingStaticFile?: boolean;
  req: FrogBotRequest;
};

export type Access<TData = any> = (args: AccessArgs<TData>) => AccessResult | Promise<AccessResult>;

export type CollectionAccess = {
  admin?: (args: { req: FrogBotRequest }) => boolean | Promise<boolean>;
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
  req: FrogBotRequest;
  siblingData?: Partial<TSiblingData>;
};

export type FieldAccess<TData extends TypeWithID = any, TSiblingData = any> = (
  args: FieldAccessArgs<TData, TSiblingData>,
) => boolean | Promise<boolean>;

// FrogBot's collection hook types.
//
// Same shape as Payload's hooks but with `FrogBotRequest` instead of
// `PayloadRequest`. Users write hooks against these types; at runtime,
// sanitize() wraps them so Payload sees PayloadRequest-compatible functions.

type CreateOrUpdateOperation = 'create' | 'update';

export type BeforeValidateHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  data?: Partial<T>;
  operation: CreateOrUpdateOperation;
  originalDoc?: T;
  req: FrogBotRequest;
}) => any;

export type BeforeChangeHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  data: Partial<T>;
  operation: CreateOrUpdateOperation;
  originalDoc?: T;
  req: FrogBotRequest;
}) => any;

export type AfterChangeHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  data: Partial<T>;
  doc: T;
  operation: CreateOrUpdateOperation;
  overrideAccess?: boolean;
  previousDoc: T;
  req: FrogBotRequest;
}) => any;

export type BeforeReadHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  doc: T;
  overrideAccess?: boolean;
  query: { [key: string]: any };
  req: FrogBotRequest;
}) => any;

export type AfterReadHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  doc: T;
  findMany?: boolean;
  overrideAccess?: boolean;
  query?: { [key: string]: any };
  req: FrogBotRequest;
}) => any;

export type BeforeDeleteHook = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  id: number | string;
  req: FrogBotRequest;
}) => any;

export type AfterDeleteHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  doc: T;
  id: number | string;
  req: FrogBotRequest;
}) => any;

// ── Auth hooks ────────────────────────────────────────────────────────

export type BeforeLoginHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  req: FrogBotRequest;
  user: T;
}) => any;

export type AfterLoginHook<T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  req: FrogBotRequest;
  token: string;
  user: T;
}) => any;

export type AfterLogoutHook<_T extends TypeWithID = any> = (args: {
  collection: SanitizedCollectionConfig;
  context: RequestContext;
  req: FrogBotRequest;
}) => any;

export type AfterForgotPasswordHook = (args: {
  args: unknown;
  collection: SanitizedCollectionConfig;
  context: RequestContext;
}) => any;

export type RefreshHook<T extends TypeWithID = any> = (args: {
  exp: number;
  req: FrogBotRequest;
  token: string;
  user: T;
}) => any;

export type MeHook<T extends TypeWithID = any> = (args: { req: FrogBotRequest; user: T }) => any;

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

/** Identifier accepted by ID-keyed operations. Mongo collections key by
 *  string; SQL collections key by number; Payload accepts both. */
export type DocID = string | number;

type CommonArgs = {
  context?: Record<string, unknown>;
  depth?: number;
  disableErrors?: boolean;
  fallbackLocale?: string;
  locale?: string;
  overrideAccess?: boolean;
  populate?: Record<string, unknown>;
  req?: FrogBotRequest;
  select?: SelectType;
  showHiddenFields?: boolean;
  user?: unknown;
};

export type FindArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where?: Where;
  sort?: Sort;
  limit?: number;
  page?: number;
  pagination?: boolean;
  draft?: boolean;
};

export type FindByIDArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
  disableErrors?: boolean;
  draft?: boolean;
};

export type CreateArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: Partial<TypedCollection<TSlug>>;
  disableVerificationEmail?: boolean;
  draft?: boolean;
  file?: {
    data: Buffer;
    mimetype: string;
    name: string;
    size: number;
    tempFilePath?: string;
  };
  filePath?: string;
};

export type UpdateByIDArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
  data: Partial<TypedCollection<TSlug>>;
  autosave?: boolean;
  draft?: boolean;
  publishSpecificLocale?: string;
};

export type UpdateManyArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where: Where;
  data: Partial<TypedCollection<TSlug>>;
  draft?: boolean;
};

export type UpdateArgs<TSlug extends CollectionSlug> =
  UpdateByIDArgs<TSlug> | UpdateManyArgs<TSlug>;

export type DeleteByIDArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
};

export type DeleteManyArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where: Where;
};

export type DeleteArgs<TSlug extends CollectionSlug> =
  DeleteByIDArgs<TSlug> | DeleteManyArgs<TSlug>;

export type CountArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where?: Where;
};

export type PaginatedDocs<T> = {
  docs: T[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
  nextPage?: number | null | undefined;
  page?: number;
  pagingCounter: number;
  prevPage?: number | null | undefined;
  totalDocs: number;
  totalPages: number;
};

export type BulkResult<T> = {
  docs: T[];
  errors: { id: DocID; message: string }[];
};

/** Result of a single-ID update/delete vs a bulk where-keyed one. */
export type UpdateResult<TSlug extends CollectionSlug, TArgs> = TArgs extends {
  id: DocID;
}
  ? TypedCollection<TSlug>
  : BulkResult<TypedCollection<TSlug>>;

export type DeleteResult<TSlug extends CollectionSlug, TArgs> = TArgs extends {
  id: DocID;
}
  ? TypedCollection<TSlug>
  : BulkResult<TypedCollection<TSlug>>;

// ── Duplicate ─────────────────────────────────────────────────────────

export type DuplicateArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
};

// ── FindDistinct ──────────────────────────────────────────────────────

export type FindDistinctArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  field: string;
  where?: Where;
  sort?: Sort;
  limit?: number;
  page?: number;
  pagination?: boolean;
};

export type PaginatedDistinctDocs<T extends Record<string, unknown>> = {
  values: T[];
  totalDocs: number;
  totalPages: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage?: number | null | undefined;
  prevPage?: number | null | undefined;
  pagingCounter: number;
};
