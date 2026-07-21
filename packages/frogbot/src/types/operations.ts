// Argument and return shapes for `FrogbotInstance` CRUD methods.
//
// v0 surface: a lean, hand-written subset of Payload's local operations.
// We own these types so the FrogBot facade has its own brand and so the
// generated collection types come from FrogBot's `GeneratedTypes` registry.
//
// Anything missing here is a deliberate v0 omission (select projection,
// draft mode, populate, locale, fallbackLocale). Re-add when needed; the
// underlying `payload.<op>` accepts all of it via the boundary cast.

import type { Sort, Where } from './payload.js';

import type { CollectionSlug, TypedCollection, TypeWithID } from './generated.js';
import type { FrogbotRequest } from './request.js';

// ── Version wrapper ───────────────────────────────────────────────────

export type TypeWithVersion<T> = {
  createdAt: string;
  id: string;
  latest?: boolean;
  parent: number | string;
  publishedLocale?: string;
  snapshot?: boolean;
  updatedAt: string;
  version: T;
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
  req?: FrogbotRequest;
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
  draft?: boolean;
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
  | UpdateByIDArgs<TSlug>
  | UpdateManyArgs<TSlug>;

export type DeleteByIDArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
};

export type DeleteManyArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where: Where;
};

export type DeleteArgs<TSlug extends CollectionSlug> =
  | DeleteByIDArgs<TSlug>
  | DeleteManyArgs<TSlug>;

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

// ── Auth operations ───────────────────────────────────────────────────

export type LoginArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { email: string; password: string };
};

export type LoginResult<TSlug extends CollectionSlug> = {
  exp?: number;
  token?: string;
  user?: TypedCollection<TSlug>;
};

export type ForgotPasswordArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { email: string };
  disableEmail?: boolean;
  expiration?: number;
};

export type ResetPasswordArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { password: string; token: string };
};

export type ResetPasswordResult = {
  token?: string;
  user: Record<string, unknown>;
};

export type VerifyEmailArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  token: string;
};

export type UnlockArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  data: { email: string };
};

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

// ── Versions ──────────────────────────────────────────────────────────

export type FindVersionsArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where?: Where;
  sort?: Sort;
  limit?: number;
  page?: number;
  pagination?: boolean;
};

export type FindVersionByIDArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
};

export type CountVersionsArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  where?: Where;
};

export type RestoreVersionArgs<TSlug extends CollectionSlug> = CommonArgs & {
  collection: TSlug;
  id: DocID;
};

// ── Auth (headers-based) ──────────────────────────────────────────────

export type AuthArgs = {
  headers: Request['headers'];
  req?: FrogbotRequest;
};

export type AuthResult = {
  permissions: Record<string, unknown>;
  responseHeaders?: Headers;
  user: (Record<string, unknown> & TypeWithID) | null;
};
