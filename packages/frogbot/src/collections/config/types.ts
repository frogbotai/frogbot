// FrogBot's CollectionConfig — the user-facing authoring shape.
//
// Strategy: extend Payload's CollectionConfig but override hooks, access,
// endpoints, and fields with frogbot's own types (which use FrogBotRequest
// instead of PayloadRequest). Users write hooks against `req.frogbot` —
// sanitize() wraps them for Payload at runtime.
//
// Users import this from `'frogbot'`. They never see the underlying Payload
// type name or import path.

import type {
  AccessArgs as PayloadAccessArgs,
  CollectionAfterChangeHook as PayloadCollectionAfterChangeHook,
  CollectionAfterDeleteHook as PayloadCollectionAfterDeleteHook,
  CollectionAfterErrorHook as PayloadCollectionAfterErrorHook,
  CollectionAfterForgotPasswordHook as PayloadCollectionAfterForgotPasswordHook,
  CollectionAfterLoginHook as PayloadCollectionAfterLoginHook,
  CollectionAfterLogoutHook as PayloadCollectionAfterLogoutHook,
  CollectionAfterMeHook as PayloadCollectionAfterMeHook,
  CollectionAfterOperationHook as PayloadCollectionAfterOperationHook,
  CollectionAfterReadHook as PayloadCollectionAfterReadHook,
  CollectionAfterRefreshHook as PayloadCollectionAfterRefreshHook,
  CollectionBeforeChangeHook as PayloadCollectionBeforeChangeHook,
  CollectionBeforeDeleteHook as PayloadCollectionBeforeDeleteHook,
  CollectionBeforeLoginHook as PayloadCollectionBeforeLoginHook,
  CollectionBeforeOperationHook as PayloadCollectionBeforeOperationHook,
  CollectionBeforeReadHook as PayloadCollectionBeforeReadHook,
  CollectionBeforeValidateHook as PayloadCollectionBeforeValidateHook,
  CollectionMeHook as PayloadCollectionMeHook,
  CollectionRefreshHook as PayloadCollectionRefreshHook,
  CollectionSlug as PayloadCollectionSlug,
  Document as PayloadDocument,
  FieldAccessArgs as PayloadFieldAccessArgs,
  TypeWithID,
} from 'payload';

import type { AdminIcon } from '../../admin/types.js';
import type { CollectionView, DocumentTabConfig } from '../../admin/views/types.js';
import type { AuthConfig } from '../../auth/types.js';
import type { GeneratePreviewURL, LivePreviewConfig } from '../../config/types.js';
import type { Endpoint } from '../../endpoints/types.js';
import type { Field } from '../../fields/config/types.js';
import type { SearchIndexConfig, SearchIndexDescriptors } from '../../search/types.js';
import type { CollectionSlug, TypedCollection } from '../../types/generated.js';
import type { PayloadCollectionConfig, SelectType, Sort, Where } from '../../types/payload.js';
import type { FrogBotArgs, FrogBotRequest } from '../../types/request.js';
import type { UploadConfig } from '../../uploads/types.js';

type Overridden = 'auth' | 'hooks' | 'access' | 'endpoints' | 'fields' | 'admin' | 'upload';

type PayloadAdmin = NonNullable<PayloadCollectionConfig['admin']>;

type PayloadFormatDocURL = NonNullable<PayloadAdmin['formatDocURL']>;

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
  | 'formatDocURL'
  | 'group'
  | 'listSearchableFields'
  | 'livePreview'
  | 'pagination'
  | 'preview'
> & {
  components?: CollectionAdminComponents;
  formatDocURL?: (
    args: FrogBotArgs<Parameters<PayloadFormatDocURL>[0]>,
  ) => ReturnType<PayloadFormatDocURL>;
  group?: PayloadAdmin['group'] | null;
  icon?: AdminIcon;
  livePreview?: LivePreviewConfig;
  preview?: GeneratePreviewURL;
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

  upload?: boolean | UploadConfig;

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

export type AccessArgs<TData = PayloadDocument> = FrogBotArgs<PayloadAccessArgs<TData>>;

export type Access<TData = PayloadDocument> = (
  args: AccessArgs<TData>,
) => AccessResult | Promise<AccessResult>;

type PayloadCollectionAccess = NonNullable<PayloadCollectionConfig['access']>;

type PayloadAdminAccess = NonNullable<PayloadCollectionAccess['admin']>;

export type CollectionAccess = {
  [K in keyof PayloadCollectionAccess]?: K extends 'admin'
    ? (args: FrogBotArgs<Parameters<PayloadAdminAccess>[0]>) => ReturnType<PayloadAdminAccess>
    : Access;
};

// ── Field-level access ────────────────────────────────────────────────

export type FieldAccessArgs<
  TData extends TypeWithID = PayloadDocument,
  TSiblingData = PayloadDocument,
> = FrogBotArgs<PayloadFieldAccessArgs<TData, TSiblingData>>;

export type FieldAccess<
  TData extends TypeWithID = PayloadDocument,
  TSiblingData = PayloadDocument,
> = (args: FieldAccessArgs<TData, TSiblingData>) => boolean | Promise<boolean>;

// FrogBot's collection hook types.
//
// Same shape as Payload's hooks but with `FrogBotRequest` instead of
// `PayloadRequest`. Users write hooks against these types; at runtime,
// sanitize() wraps them so Payload sees PayloadRequest-compatible functions.

type SwapReq<T> = T extends unknown
  ? 'req' extends keyof T
    ? undefined extends T['req']
      ? Omit<T, 'req'> & { req?: FrogBotRequest }
      : FrogBotArgs<T>
    : T
  : never;

type SwapOperationArgs<T> = T extends { args: infer A }
  ? Omit<SwapReq<T>, 'args'> & { args: SwapReq<A> }
  : never;

export type CollectionBeforeOperationHook<TSlug extends PayloadCollectionSlug = string> = (
  args: SwapOperationArgs<Parameters<PayloadCollectionBeforeOperationHook<TSlug>>[0]>,
) =>
  | SwapReq<Exclude<Awaited<ReturnType<PayloadCollectionBeforeOperationHook<TSlug>>>, void>>
  | void
  | Promise<SwapReq<
      Exclude<Awaited<ReturnType<PayloadCollectionBeforeOperationHook<TSlug>>>, void>
    > | void>;

export type CollectionBeforeValidateHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionBeforeValidateHook<T>>[0]>,
) => ReturnType<PayloadCollectionBeforeValidateHook<T>>;

export type CollectionBeforeChangeHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionBeforeChangeHook<T>>[0]>,
) => ReturnType<PayloadCollectionBeforeChangeHook<T>>;

export type CollectionAfterChangeHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterChangeHook<T>>[0]>,
) => ReturnType<PayloadCollectionAfterChangeHook<T>>;

export type CollectionBeforeReadHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionBeforeReadHook<T>>[0]>,
) => ReturnType<PayloadCollectionBeforeReadHook<T>>;

export type CollectionAfterReadHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterReadHook<T>>[0]>,
) => ReturnType<PayloadCollectionAfterReadHook<T>>;

export type CollectionBeforeDeleteHook = (
  args: FrogBotArgs<Parameters<PayloadCollectionBeforeDeleteHook>[0]>,
) => ReturnType<PayloadCollectionBeforeDeleteHook>;

export type CollectionAfterDeleteHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterDeleteHook<T>>[0]>,
) => ReturnType<PayloadCollectionAfterDeleteHook<T>>;

export type CollectionAfterOperationHook<TSlug extends PayloadCollectionSlug = string> = (
  args: SwapOperationArgs<Parameters<PayloadCollectionAfterOperationHook<TSlug>>[0]>,
) => ReturnType<PayloadCollectionAfterOperationHook<TSlug>>;

export type CollectionBeforeLoginHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionBeforeLoginHook<T>>[0]>,
) => ReturnType<PayloadCollectionBeforeLoginHook<T>>;

export type CollectionAfterLoginHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterLoginHook<T>>[0]>,
) => ReturnType<PayloadCollectionAfterLoginHook<T>>;

export type CollectionAfterLogoutHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterLogoutHook<T>>[0]>,
) => ReturnType<PayloadCollectionAfterLogoutHook<T>>;

export type CollectionAfterMeHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterMeHook<T>>[0]>,
) => ReturnType<PayloadCollectionAfterMeHook<T>>;

export type CollectionRefreshHook<T extends TypeWithID = PayloadDocument> = (
  args: SwapOperationArgs<Parameters<PayloadCollectionRefreshHook<T>>[0]>,
) => ReturnType<PayloadCollectionRefreshHook<T>>;

export type CollectionMeHook<T extends TypeWithID = PayloadDocument> = (
  args: SwapOperationArgs<Parameters<PayloadCollectionMeHook<T>>[0]>,
) => ReturnType<PayloadCollectionMeHook<T>>;

export type CollectionAfterRefreshHook<T extends TypeWithID = PayloadDocument> = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterRefreshHook<T>>[0]>,
) => ReturnType<PayloadCollectionAfterRefreshHook<T>>;

export type CollectionAfterErrorHook = (
  args: FrogBotArgs<Parameters<PayloadCollectionAfterErrorHook>[0]>,
) => ReturnType<PayloadCollectionAfterErrorHook>;

export type CollectionAfterForgotPasswordHook = PayloadCollectionAfterForgotPasswordHook;

export type CollectionHooks<T extends TypeWithID = PayloadDocument> = {
  afterChange?: CollectionAfterChangeHook<T>[];
  afterDelete?: CollectionAfterDeleteHook<T>[];
  afterError?: CollectionAfterErrorHook[];
  afterForgotPassword?: CollectionAfterForgotPasswordHook[];
  afterLogin?: CollectionAfterLoginHook<T>[];
  afterLogout?: CollectionAfterLogoutHook<T>[];
  afterMe?: CollectionAfterMeHook<T>[];
  afterOperation?: CollectionAfterOperationHook[];
  afterRead?: CollectionAfterReadHook<T>[];
  afterRefresh?: CollectionAfterRefreshHook<T>[];
  beforeChange?: CollectionBeforeChangeHook<T>[];
  beforeDelete?: CollectionBeforeDeleteHook[];
  beforeLogin?: CollectionBeforeLoginHook<T>[];
  beforeOperation?: CollectionBeforeOperationHook[];
  beforeRead?: CollectionBeforeReadHook<T>[];
  beforeValidate?: CollectionBeforeValidateHook<T>[];
  me?: CollectionMeHook<T>[];
  refresh?: CollectionRefreshHook<T>[];
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

type WriteArgs = CommonArgs & {
  /** Skip the database transaction this operation would otherwise open. */
  disableTransaction?: boolean;
};

type LockedWriteArgs = WriteArgs & {
  /** Set to `false` to reject the write while another user holds the document lock. */
  overrideLock?: boolean;
};

type UploadArgs = {
  /** Upload collections only. Absolute path of a file on disk to store. */
  filePath?: string;
  /** Replace a stored file with the same name instead of saving the upload under a new name. */
  overwriteExistingFiles?: boolean;
};

type LocalePublishArgs = {
  /** Publish every locale. Needs `versions.drafts.localizeStatus`. */
  publishAllLocales?: boolean;
  /** Unpublish every locale. Needs `versions.drafts.localizeStatus`. */
  unpublishAllLocales?: boolean;
};

export type JoinQuery =
  | false
  | Record<
      string,
      | {
          count?: boolean;
          limit?: number;
          page?: number;
          sort?: string;
          where?: Where;
        }
      | false
    >;

export type FindArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where?: Where;
  sort?: Sort;
  limit?: number;
  page?: number;
  pagination?: boolean;
  draft?: boolean;
  joins?: JoinQuery;
};

export type FindByIDArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
  disableErrors?: boolean;
  draft?: boolean;
  joins?: JoinQuery;
};

export type CreateArgs<TSlug extends CollectionSlug> = WriteArgs &
  UploadArgs & {
    collection: TSlug;
    data: Partial<TypedCollection<TSlug>>;
    disableVerificationEmail?: boolean;
    draft?: boolean;
    /** Copy this document's data, and its file in an upload collection, into the new document. `data` overrides copied fields. */
    duplicateFromID?: DocID;
    file?: {
      data: Buffer;
      mimetype: string;
      name: string;
      size: number;
      tempFilePath?: string;
    };
  };

export type UpdateByIDArgs<TSlug extends CollectionSlug> = LockedWriteArgs &
  UploadArgs &
  LocalePublishArgs & {
    collection: TSlug;
    id: DocID;
    data: Partial<TypedCollection<TSlug>>;
    autosave?: boolean;
    draft?: boolean;
    publishSpecificLocale?: string;
  };

export type UpdateManyArgs<TSlug extends CollectionSlug> = LockedWriteArgs &
  UploadArgs &
  LocalePublishArgs & {
    collection: TSlug;
    where: Where;
    data: Partial<TypedCollection<TSlug>>;
    draft?: boolean;
  };

export type UpdateArgs<TSlug extends CollectionSlug> =
  UpdateByIDArgs<TSlug> | UpdateManyArgs<TSlug>;

export type DeleteByIDArgs<TSlug extends CollectionSlug> = LockedWriteArgs & {
  collection: TSlug;
  id: DocID;
};

export type DeleteManyArgs<TSlug extends CollectionSlug> = LockedWriteArgs & {
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

export type DuplicateArgs<TSlug extends CollectionSlug> = WriteArgs & {
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
