import type { SelectType } from 'frogbot';

import type {
  CollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  PopulateType,
  RequiredDataFromCollectionSlug,
  TransformCollectionWithSelect,
  TypedLocale,
  UploadCollectionSlug,
} from '../types.js';
import { resolveFileFromOptions } from '../utilities/resolveFileFromOptions.js';

export type CreateOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectType,
> = {
  /**
   * The collection slug to operate against.
   */
  collection: TSlug;
  /**
   * The data for the document to create.
   */
  data: RequiredDataFromCollectionSlug<T, TSlug>;
  /**
   * How many levels of relationship and upload fields to populate in the result.
   */
  depth?: number;
  /**
   * Create the document as a draft.
   */
  draft?: boolean;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * The file to upload, as a `Blob` or a URL to fetch it from. Only for upload collections.
   */
  file?: TSlug extends UploadCollectionSlug<T> ? Blob | string : never;
  /**
   * The locale of the data and the returned document.
   */
  locale?: 'all' | TypedLocale<T>;
  /**
   * Which fields to include from populated documents, per collection.
   */
  populate?: PopulateType<T>;
  /**
   * Which fields to include in the result.
   */
  select?: TSelect;
};

export async function create<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectType,
>(
  send: FrogBotSDKSend,
  options: CreateOptions<T, TSlug, TSelect>,
  init?: RequestInit,
): Promise<TransformCollectionWithSelect<T, TSlug, TSelect>> {
  const file = options.file ? await resolveFileFromOptions(options.file) : undefined;

  const response = await send({
    args: options,
    file,
    init,
    json: options.data,
    method: 'POST',
    path: `/${options.collection}`,
  });

  const json = await response.json();

  return json.doc;
}
