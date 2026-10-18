import type { Sort, Where } from 'frogbot';
import { stringify } from 'qs-esm';

const stringifyOptions = { addQueryPrefix: true, allowEmptyArrays: true };

export type OperationArgs = {
  autosave?: boolean;
  depth?: number;
  draft?: boolean;
  fallbackLocale?: unknown;
  joins?: Record<string, unknown>;
  limit?: number;
  locale?: unknown;
  page?: number;
  pagination?: boolean;
  populate?: Record<string, unknown>;
  publishAllLocales?: boolean;
  select?: unknown;
  sort?: Sort;
  trash?: boolean;
  unpublishAllLocales?: boolean;
  where?: Where;
};

export const buildSearchParams = (args: OperationArgs): string => {
  const search: Record<string, unknown> = {};

  if (typeof args.depth === 'number') {
    search.depth = String(args.depth);
  }

  if (typeof args.page === 'number') {
    search.page = String(args.page);
  }

  if (typeof args.limit === 'number') {
    search.limit = String(args.limit);
  }

  if (typeof args.draft === 'boolean') {
    search.draft = String(args.draft);
  }

  if (typeof args.autosave === 'boolean') {
    search.autosave = String(args.autosave);
  }

  if (typeof args.trash === 'boolean') {
    search.trash = String(args.trash);
  }

  if (typeof args.pagination === 'boolean') {
    search.pagination = String(args.pagination);
  }

  if (args.fallbackLocale !== undefined) {
    search['fallback-locale'] = String(args.fallbackLocale);
  }

  if (args.locale) {
    search.locale = args.locale;
  }

  if (typeof args.publishAllLocales === 'boolean') {
    search.publishAllLocales = String(args.publishAllLocales);
  }

  if (typeof args.unpublishAllLocales === 'boolean') {
    search.unpublishAllLocales = String(args.unpublishAllLocales);
  }

  if (args.sort) {
    search.sort = Array.isArray(args.sort) ? args.sort.join(',') : args.sort;
  }

  if (args.select) {
    search.select = args.select;
  }

  if (args.where) {
    search.where = args.where;
  }

  if (args.populate) {
    search.populate = args.populate;
  }

  if (args.joins) {
    search.joins = args.joins;
  }

  if (Object.keys(search).length > 0) {
    return stringify(search, stringifyOptions);
  }

  return '';
};
