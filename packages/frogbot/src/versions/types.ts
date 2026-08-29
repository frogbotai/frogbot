import type { CollectionSlug } from '../types/generated.js';
import type { Sort, Where } from '../types/payload.js';
import type { FrogbotRequest } from '../types/request.js';

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
