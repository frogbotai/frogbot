import type {
  SearchHitComponents,
  SearchMode,
  SearchQuery,
  SearchRanking,
  SelectType,
} from 'frogbot';

import type {
  CollectionSlug,
  DataFromCollectionSlug,
  FrogBotSDKSend,
  FrogBotTypesShape,
  TypedLocale,
  WhereFromCollectionSlug,
} from './types.js';

export type SearchOptions<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = {
  /**
   * The name of the collection's search index to query.
   */
  index: string;
  /**
   * The text, vector, or both to search for.
   */
  query: SearchQuery;
  /**
   * A filter query applied to the hits.
   */
  where?: WhereFromCollectionSlug<T, TSlug>;
  /**
   * The maximum number of hits to return.
   */
  limit?: number;
  /**
   * How many candidates each ranking method considers before the final hits are chosen.
   */
  candidates?: number;
  /**
   * Which fields to include in each hit's document.
   */
  select?: SelectType;
  /**
   * How many levels of relationship and upload fields to populate.
   */
  depth?: number;
  /**
   * Search the latest drafts instead of published documents.
   */
  draft?: boolean;
  /**
   * The locale of the returned documents.
   */
  locale?: string;
  /**
   * The locale to fall back to when a localized field has no value.
   */
  fallbackLocale?: false | TypedLocale<T>;
};

export type SearchHit<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = {
  doc: DataFromCollectionSlug<T, TSlug>;
  score: number;
  components?: SearchHitComponents;
};

export type SearchResult<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>> = {
  mode: SearchMode;
  ranking: SearchRanking;
  hits: SearchHit<T, TSlug>[];
};

const searchKeys = [
  'candidates',
  'depth',
  'draft',
  'fallbackLocale',
  'index',
  'limit',
  'locale',
  'query',
  'select',
  'where',
] as const satisfies readonly (keyof SearchOptions<FrogBotTypesShape, string>)[];

export async function search<T extends FrogBotTypesShape, TSlug extends CollectionSlug<T>>(
  send: FrogBotSDKSend,
  collection: TSlug,
  options: SearchOptions<T, TSlug>,
  init?: RequestInit,
): Promise<SearchResult<T, TSlug>> {
  const body: Record<string, unknown> = {};

  searchKeys.forEach((key) => {
    if (options[key] !== undefined) body[key] = options[key];
  });

  const response = await send({
    init,
    json: body,
    method: 'POST',
    path: `/${collection}/search`,
  });

  return response.json();
}
