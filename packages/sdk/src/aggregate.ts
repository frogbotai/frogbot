import type { AggregateDateUnit, Sort } from 'frogbot';

import type {
  CollectionSlug,
  DataFromCollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  PopulateType,
  TypedLocale,
  WhereFromCollectionSlug,
} from './types.js';

type Data<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = DataFromCollectionSlug<
  T,
  TSlug
>;

type DataKey<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = Extract<
  keyof Data<T, TSlug>,
  string
>;

type NumberKey<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = {
  [K in DataKey<T, TSlug>]-?: NonNullable<Data<T, TSlug>[K]> extends number ? K : never;
}[DataKey<T, TSlug>];

/**
 * A field path on the collection; dot paths reach into groups and related documents.
 */
export type AggregateFieldPath<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> =
  ({} & string) | DataKey<T, TSlug>;

/**
 * A field path, or a date field grouped by the UTC start of its day, ISO week, month, quarter or year.
 */
export type AggregateGroupBy<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> =
  AggregateFieldPath<T, TSlug> | { field: AggregateFieldPath<T, TSlug>; by: AggregateDateUnit };

export type AggregateValue<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> =
  | { count: true }
  | { sum: ({} & string) | NumberKey<T, TSlug> }
  | { avg: ({} & string) | NumberKey<T, TSlug> }
  | { min: AggregateFieldPath<T, TSlug> }
  | { max: AggregateFieldPath<T, TSlug> };

export type AggregateValues<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = Record<
  string,
  AggregateValue<T, TSlug>
>;

export type AggregateOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  V extends AggregateValues<T, TSlug> = AggregateValues<T, TSlug>,
> = {
  /**
   * The collection to aggregate.
   */
  collection: TSlug;
  /**
   * The field, date bucket, or list of them that forms each group.
   */
  groupBy: AggregateGroupBy<T, TSlug> | readonly AggregateGroupBy<T, TSlug>[];
  /**
   * The totals to compute for each group, by the name each appears under in the result.
   */
  values: V;
  /**
   * A filter query applied before grouping.
   */
  where?: WhereFromCollectionSlug<T, TSlug>;
  /**
   * `groupBy` paths and `values` names to sort by; prefix with `-` for descending.
   */
  sort?: Sort;
  /**
   * Groups per page. Leave it out to return every group.
   */
  limit?: number;
  /**
   * The page of groups to return.
   */
  page?: number;
  /**
   * How many levels of relationship group keys to populate.
   */
  depth?: number;
  /**
   * Which fields of populated group keys to include, per collection.
   */
  populate?: PopulateType<T>;
  /**
   * Include drafts instead of published documents only.
   */
  draft?: boolean;
  /**
   * Include trashed documents. Has no effect unless the collection has `trash` enabled.
   */
  trash?: boolean;
  /**
   * The locale localized fields are grouped and totalled in.
   */
  locale?: TypedLocale<T>;
  /**
   * The locale to fall back to when a populated document has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * Return no groups instead of a 403 when the user can't read the collection.
   */
  disableErrors?: boolean;
};

type ExtremeResult<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>, F> =
  F extends DataKey<T, TSlug>
    ? (NonNullable<Data<T, TSlug>[F]> extends number ? number : string) | null
    : number | string | null;

export type AggregateValueResult<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  V,
> = V extends { count: true }
  ? number
  : V extends { sum: string }
    ? number
    : V extends { avg: string }
      ? number | null
      : V extends { min: infer F }
        ? ExtremeResult<T, TSlug, F>
        : V extends { max: infer F }
          ? ExtremeResult<T, TSlug, F>
          : never;

export type AggregateGroup<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  V extends AggregateValues<T, TSlug> = AggregateValues<T, TSlug>,
> = {
  group: Record<string, unknown>;
  values: { -readonly [K in keyof V]: AggregateValueResult<T, TSlug, V[K]> };
};

export type AggregateResult<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  V extends AggregateValues<T, TSlug> = AggregateValues<T, TSlug>,
> = {
  groups: AggregateGroup<T, TSlug, V>[];
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

const aggregateKeys = [
  'depth',
  'disableErrors',
  'draft',
  'fallbackLocale',
  'groupBy',
  'limit',
  'locale',
  'page',
  'populate',
  'sort',
  'trash',
  'values',
  'where',
] as const satisfies readonly (keyof AggregateOptions<FrogBotTypesShape, string>)[];

export async function aggregate<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  V extends AggregateValues<T, TSlug>,
>(
  send: FrogBotSDKSend,
  options: AggregateOptions<T, TSlug, V>,
  init?: RequestInit,
): Promise<AggregateResult<T, TSlug, V>> {
  const body: Record<string, unknown> = {};

  aggregateKeys.forEach((key) => {
    if (options[key] !== undefined) body[key] = options[key];
  });

  const response = await send({
    init,
    json: body,
    method: 'POST',
    path: `/${options.collection}/aggregate`,
  });

  return response.json();
}
