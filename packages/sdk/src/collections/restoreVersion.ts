import type {
  CollectionSlug,
  DataFromCollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  PopulateType,
  TypedLocale,
} from '../types.js';

export type RestoreVersionByIDOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
> = {
  /**
   * The collection slug to operate against.
   */
  collection: TSlug;
  /**
   * How many levels of relationship and upload fields to populate in the result.
   */
  depth?: number;
  /**
   * Restore the version as a draft.
   */
  draft?: boolean;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * The ID of the version to restore.
   */
  id: number | string;
  /**
   * The locale of the returned document.
   */
  locale?: 'all' | TypedLocale<T>;
  /**
   * Which fields to include from populated documents, per collection.
   */
  populate?: PopulateType<T>;
};

export async function restoreVersion<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>>(
  send: FrogBotSDKSend,
  options: RestoreVersionByIDOptions<T, TSlug>,
  init?: RequestInit,
): Promise<DataFromCollectionSlug<T, TSlug>> {
  const response = await send({
    args: options,
    init,
    method: 'POST',
    path: `/${options.collection}/versions/${options.id}`,
  });

  return response.json();
}
