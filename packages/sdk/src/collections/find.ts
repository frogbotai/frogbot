import type { PaginatedDocs, Sort } from 'frogbot';

import type {
  CollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  JoinQuery,
  PopulateType,
  SelectFromCollectionSlug,
  TransformCollectionWithSelect,
  TypedLocale,
  WhereFromCollectionSlug,
} from '../types.js';

export type FindOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = {
  /**
   * The collection slug to operate against.
   */
  collection: TSlug;
  /**
   * How many levels of relationship and upload fields to populate.
   */
  depth?: number;
  /**
   * Query the latest drafts instead of published documents.
   */
  draft?: boolean;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * Pagination, sort, and filters per join field. Set a join field to `false` to leave it out of the result.
   */
  joins?: JoinQuery<T, TSlug>;
  /**
   * The maximum number of documents to return.
   * @default 10
   */
  limit?: number;
  /**
   * The locale of the returned documents.
   */
  locale?: 'all' | TypedLocale<T>;
  /**
   * The page of results to return.
   * @default 1
   */
  page?: number;
  /**
   * Set to `false` to skip the document count. Combine with `limit` to cap the result without counting.
   */
  pagination?: boolean;
  /**
   * Which fields to include from populated documents, per collection.
   */
  populate?: PopulateType<T>;
  /**
   * Which fields to include in the result.
   */
  select?: TSelect;
  /**
   * Sort by one or more fields. Prefix a field with `-` to sort descending.
   * @example '-createdAt'
   * @example ['group', '-createdAt']
   */
  sort?: Sort;
  /**
   * Include trashed documents. Combine with a `where` on `deletedAt` to return only trashed documents.
   * Has no effect unless the collection has `trash` enabled.
   * @default false
   */
  trash?: boolean;
  /**
   * A filter query.
   */
  where?: WhereFromCollectionSlug<T, TSlug>;
};

export async function find<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
>(
  send: FrogBotSDKSend,
  options: FindOptions<T, TSlug, TSelect>,
  init?: RequestInit,
): Promise<PaginatedDocs<TransformCollectionWithSelect<T, TSlug, TSelect>>> {
  const response = await send({
    args: options,
    init,
    method: 'GET',
    path: `/${options.collection}`,
  });

  return response.json();
}
