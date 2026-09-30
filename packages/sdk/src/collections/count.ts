import type {
  CollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  TypedLocale,
  WhereFromCollectionSlug,
} from '../types.js';

export type CountOptions<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = {
  /**
   * The collection slug to operate against.
   */
  collection: TSlug;
  /**
   * The locale to count documents in.
   */
  locale?: 'all' | TypedLocale<T>;
  /**
   * Include trashed documents in the count. Has no effect unless the collection has `trash` enabled.
   * @default false
   */
  trash?: boolean;
  /**
   * A filter query.
   */
  where?: WhereFromCollectionSlug<T, TSlug>;
};

export async function count<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>>(
  send: FrogBotSDKSend,
  options: CountOptions<T, TSlug>,
  init?: RequestInit,
): Promise<{ totalDocs: number }> {
  const response = await send({
    args: options,
    init,
    method: 'GET',
    path: `/${options.collection}/count`,
  });

  return response.json();
}
