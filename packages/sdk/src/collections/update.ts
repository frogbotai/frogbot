import type {
  BulkOperationResult,
  CollectionSlug,
  DeepPartial,
  FrogBotSDKSend,
  FrogBotTypesShape,
  PopulateType,
  RequiredDataFromCollectionSlug,
  SelectFromCollectionSlug,
  TransformCollectionWithSelect,
  TypedLocale,
  UploadCollectionSlug,
  WhereFromCollectionSlug,
} from '../types.js';
import { resolveFileFromOptions } from '../utilities/resolveFileFromOptions.js';

export type UpdateBaseOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = {
  /**
   * The collection slug to operate against.
   */
  collection: TSlug;
  /**
   * The fields to update.
   */
  data: DeepPartial<RequiredDataFromCollectionSlug<T, TSlug>>;
  /**
   * How many levels of relationship and upload fields to populate in the result.
   */
  depth?: number;
  /**
   * Save the update as a draft.
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
   * The locale of the data and the returned documents.
   */
  locale?: TypedLocale<T>;
  /**
   * Which fields to include from populated documents, per collection.
   */
  populate?: PopulateType<T>;
  /**
   * Which fields to include in the result.
   */
  select?: TSelect;
  /**
   * Allow the update to target trashed documents. Has no effect unless the collection has `trash` enabled.
   * @default false
   */
  trash?: boolean;
};

export type UpdateByIDOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = {
  /**
   * Save the update as an autosave of the current draft. Use with `draft: true`. The collection needs `versions.drafts.autosave`.
   */
  autosave?: boolean;
  /**
   * The ID of the document to update.
   */
  id: number | string;
  limit?: never;
  /**
   * Publish only this locale's changes. Other locales keep their published values.
   */
  publishSpecificLocale?: TypedLocale<T>;
  where?: never;
} & UpdateBaseOptions<T, TSlug, TSelect>;

export type UpdateManyOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = {
  id?: never;
  /**
   * The maximum number of documents to update.
   */
  limit?: number;
  /**
   * A filter query selecting the documents to update.
   */
  where: WhereFromCollectionSlug<T, TSlug>;
} & UpdateBaseOptions<T, TSlug, TSelect>;

export type UpdateOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = UpdateByIDOptions<T, TSlug, TSelect> | UpdateManyOptions<T, TSlug, TSelect>;

export async function update<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
>(
  send: FrogBotSDKSend,
  options: UpdateOptions<T, TSlug, TSelect>,
  init?: RequestInit,
): Promise<
  BulkOperationResult<T, TSlug, TSelect> | TransformCollectionWithSelect<T, TSlug, TSelect>
> {
  const file = options.file ? await resolveFileFromOptions(options.file) : undefined;

  const response = await send({
    args: options,
    file,
    init,
    json: options.data,
    method: 'PATCH',
    path: `/${options.collection}${options.id ? `/${options.id}` : ''}`,
  });

  const json = await response.json();

  if (options.id) return json.doc;

  return json;
}
