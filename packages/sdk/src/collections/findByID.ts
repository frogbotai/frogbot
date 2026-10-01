import type { ApplyDisableErrors, SelectType } from 'frogbot';

import type {
  CollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  JoinQuery,
  PopulateType,
  SelectFromCollectionSlug,
  TransformCollectionWithSelect,
  TypedLocale,
} from '../types.js';

export type FindByIDOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TDisableErrors extends boolean,
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
   * Return `null` instead of throwing when the document isn't found or the request fails.
   */
  disableErrors?: TDisableErrors;
  /**
   * Return the latest draft instead of the published document.
   */
  draft?: boolean;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * The ID of the document to find.
   */
  id: number | string;
  /**
   * Pagination, sort, and filters per join field. Set a join field to `false` to leave it out of the result.
   */
  joins?: JoinQuery<T, TSlug>;
  /**
   * The locale of the returned document.
   */
  locale?: 'all' | TypedLocale<T>;
  /**
   * Which fields to include from populated documents, per collection.
   */
  populate?: PopulateType<T>;
  /**
   * Which fields to include in the result.
   */
  select?: SelectType & TSelect;
  /**
   * Return the document even if it's trashed. Has no effect unless the collection has `trash` enabled.
   * @default false
   */
  trash?: boolean;
};

export async function findByID<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TDisableErrors extends boolean,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
>(
  send: FrogBotSDKSend,
  options: FindByIDOptions<T, TSlug, TDisableErrors, TSelect>,
  init?: RequestInit,
): Promise<ApplyDisableErrors<TransformCollectionWithSelect<T, TSlug, TSelect>, TDisableErrors>> {
  try {
    const response = await send({
      args: options,
      init,
      method: 'GET',
      path: `/${options.collection}/${options.id}`,
    });

    return response.json();
  } catch (error) {
    if (options.disableErrors) {
      return null as ApplyDisableErrors<
        TransformCollectionWithSelect<T, TSlug, TSelect>,
        TDisableErrors
      >;
    }

    throw error;
  }
}
