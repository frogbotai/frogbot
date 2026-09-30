import type { PaginatedDocs, SelectType, Sort, TypeWithVersion, Where } from 'frogbot';

import type {
  CollectionSlug,
  DataFromCollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  PopulateType,
  TypedLocale,
} from '../types.js';

export type FindVersionsOptions<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = {
  /**
   * The collection slug to operate against.
   */
  collection: TSlug;
  /**
   * How many levels of relationship and upload fields to populate.
   */
  depth?: number;
  /**
   * Include draft versions.
   */
  draft?: boolean;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * The maximum number of versions to return.
   * @default 10
   */
  limit?: number;
  /**
   * The locale of the returned versions.
   */
  locale?: 'all' | TypedLocale<T>;
  /**
   * The page of results to return.
   * @default 1
   */
  page?: number;
  /**
   * Set to `false` to skip the version count. Combine with `limit` to cap the result without counting.
   */
  pagination?: boolean;
  /**
   * Which fields to include from populated documents, per collection.
   */
  populate?: PopulateType<T>;
  /**
   * Which fields to include in the result.
   */
  select?: SelectType;
  /**
   * Sort by one or more fields. Prefix a field with `-` to sort descending.
   * @example '-version.createdAt'
   * @example ['version.group', '-version.createdAt']
   */
  sort?: Sort;
  /**
   * Include versions of trashed documents. Has no effect unless the collection has `trash` enabled.
   * @default false
   */
  trash?: boolean;
  /**
   * A filter query, for example `{ parent: { equals: id } }`.
   */
  where?: Where;
};

export async function findVersions<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>>(
  send: FrogBotSDKSend,
  options: FindVersionsOptions<T, TSlug>,
  init?: RequestInit,
): Promise<PaginatedDocs<TypeWithVersion<DataFromCollectionSlug<T, TSlug>>>> {
  const response = await send({
    args: options,
    init,
    method: 'GET',
    path: `/${options.collection}/versions`,
  });

  return response.json();
}
