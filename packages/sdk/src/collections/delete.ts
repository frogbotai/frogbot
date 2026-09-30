import type {
  BulkOperationResult,
  CollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  PopulateType,
  SelectFromCollectionSlug,
  TransformCollectionWithSelect,
  TypedLocale,
  WhereFromCollectionSlug,
} from '../types.js';

export type DeleteBaseOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = {
  /**
   * The collection slug to operate against.
   */
  collection: TSlug;
  /**
   * How many levels of relationship and upload fields to populate in the result.
   */
  depth?: number;
  draft?: boolean;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
  /**
   * The locale of the returned documents.
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
   * Allow the delete to target trashed documents. Has no effect unless the collection has `trash` enabled.
   * @default false
   */
  trash?: boolean;
};

export type DeleteByIDOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = {
  /**
   * The ID of the document to delete.
   */
  id: number | string;
  where?: never;
} & DeleteBaseOptions<T, TSlug, TSelect>;

export type DeleteManyOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = {
  id?: never;
  /**
   * A filter query selecting the documents to delete.
   */
  where: WhereFromCollectionSlug<T, TSlug>;
} & DeleteBaseOptions<T, TSlug, TSelect>;

export type DeleteOptions<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
> = DeleteByIDOptions<T, TSlug, TSelect> | DeleteManyOptions<T, TSlug, TSelect>;

export async function deleteOperation<
  T extends FrogBotTypesShape,
  TSlug extends CollectionSlug<T>,
  TSelect extends SelectFromCollectionSlug<T, TSlug>,
>(
  send: FrogBotSDKSend,
  options: DeleteOptions<T, TSlug, TSelect>,
  init?: RequestInit,
): Promise<
  BulkOperationResult<T, TSlug, TSelect> | TransformCollectionWithSelect<T, TSlug, TSelect>
> {
  const response = await send({
    args: options,
    init,
    method: 'DELETE',
    path: `/${options.collection}${options.id ? `/${options.id}` : ''}`,
  });

  const json = await response.json();

  if (options.id) return json.doc;

  return json;
}
