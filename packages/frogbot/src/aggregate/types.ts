import type { PopulateType, RequestContext, Sort, TypedLocale, Where } from 'payload';

import type { CollectionSlug, TypedCollection } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';

type DataKey<T extends CollectionSlug> = Extract<keyof TypedCollection<T>, string>;

type NumberKey<T extends CollectionSlug> = {
  [K in DataKey<T>]-?: NonNullable<TypedCollection<T>[K]> extends number ? K : never;
}[DataKey<T>];

/** A field path on the collection; dot paths reach into groups and related documents. */
export type AggregateFieldPath<T extends CollectionSlug = CollectionSlug> =
  ({} & string) | DataKey<T>;

export type AggregateDateUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** Groups a date field by the UTC start of its day, ISO week (Monday), month, quarter or year. */
export type AggregateDateGroup<T extends CollectionSlug = CollectionSlug> = {
  field: AggregateFieldPath<T>;
  by: AggregateDateUnit;
};

export type AggregateGroupBy<T extends CollectionSlug = CollectionSlug> =
  AggregateFieldPath<T> | AggregateDateGroup<T>;

export type AggregateValue<T extends CollectionSlug = CollectionSlug> =
  | { count: true }
  | { sum: ({} & string) | NumberKey<T> }
  | { avg: ({} & string) | NumberKey<T> }
  | { min: AggregateFieldPath<T> }
  | { max: AggregateFieldPath<T> };

export type AggregateValues<T extends CollectionSlug = CollectionSlug> = Record<
  string,
  AggregateValue<T>
>;

export type AggregateOperation = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type AggregateOptions<
  T extends CollectionSlug = CollectionSlug,
  V extends AggregateValues<T> = AggregateValues<T>,
> = {
  collection: T;
  groupBy: AggregateGroupBy<T> | readonly AggregateGroupBy<T>[];
  values: V;
  where?: Where;
  sort?: Sort;
  limit?: number;
  page?: number;
  depth?: number;
  populate?: PopulateType;
  draft?: boolean;
  trash?: boolean;
  locale?: string;
  fallbackLocale?: false | TypedLocale;
  context?: RequestContext;
  disableErrors?: boolean;
  overrideAccess?: boolean;
  req?: FrogBotRequest;
};

type ExtremeResult<T extends CollectionSlug, F> =
  F extends DataKey<T>
    ? (NonNullable<TypedCollection<T>[F]> extends number ? number : string) | null
    : number | string | null;

export type AggregateValueResult<T extends CollectionSlug, V> = V extends { count: true }
  ? number
  : V extends { sum: string }
    ? number
    : V extends { avg: string }
      ? number | null
      : V extends { min: infer F }
        ? ExtremeResult<T, F>
        : V extends { max: infer F }
          ? ExtremeResult<T, F>
          : never;

export type AggregateGroup<
  T extends CollectionSlug = CollectionSlug,
  V extends AggregateValues<T> = AggregateValues<T>,
> = {
  group: Record<string, unknown>;
  values: { -readonly [K in keyof V]: AggregateValueResult<T, V[K]> };
};

export type AggregateResult<
  T extends CollectionSlug = CollectionSlug,
  V extends AggregateValues<T> = AggregateValues<T>,
> = {
  groups: AggregateGroup<T, V>[];
  totalDocs: number;
  totalPages: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
  pagingCounter: number;
};

/** What an adapter stores a grouped or aggregated field as. */
export type AggregateFieldType = 'boolean' | 'date' | 'id' | 'number' | 'string';

export type AggregateGroupDescriptor = {
  path: string;
  type: AggregateFieldType;
  by?: AggregateDateUnit;
};

export type AggregateValueDescriptor =
  | { operation: 'count' }
  | { operation: Exclude<AggregateOperation, 'count'>; path: string; type: 'date' | 'number' };

export type AggregateSortDescriptor = {
  target: 'group' | 'value';
  index: number;
  direction: 'asc' | 'desc';
};
