import type { ApplyDisableErrors, SelectType, TypeWithVersion } from 'frogbot';

import type {
  CollectionSlug,
  DataFromCollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  PopulateType,
  TypedLocale,
} from '../types.js';

export type FindVersionByIDOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TDisableErrors extends boolean,
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
   * Return `null` instead of throwing when the version isn't found or the request fails.
   */
  disableErrors?: TDisableErrors;
  /**
   * Include draft versions.
   */
  draft?: boolean;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * The ID of the version to find.
   */
  id: number | string;
  /**
   * The locale of the returned version.
   */
  locale?: 'all' | TypedLocale<T>;
  /**
   * Which fields to include from populated documents, per collection.
   */
  populate?: PopulateType<T>;
  /**
   * Which fields to include in the result.
   */
  select?: SelectType;
  /**
   * Return the version even if its document is trashed. Has no effect unless the collection has `trash` enabled.
   * @default false
   */
  trash?: boolean;
};

export async function findVersionByID<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TDisableErrors extends boolean,
>(
  send: FrogBotSDKSend,
  options: FindVersionByIDOptions<T, TSlug, TDisableErrors>,
  init?: RequestInit,
): Promise<ApplyDisableErrors<TypeWithVersion<DataFromCollectionSlug<T, TSlug>>, TDisableErrors>> {
  try {
    const response = await send({
      args: options,
      init,
      method: 'GET',
      path: `/${options.collection}/versions/${options.id}`,
    });

    return response.json();
  } catch (error) {
    if (options.disableErrors) {
      return null as ApplyDisableErrors<
        TypeWithVersion<DataFromCollectionSlug<T, TSlug>>,
        TDisableErrors
      >;
    }

    throw error;
  }
}
