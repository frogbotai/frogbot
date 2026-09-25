import type { SelectType, TypedLocale, Where } from 'payload';

import type { CollectionSlug, TypedCollection } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';

export type SearchMetric = 'cosine' | 'euclidean' | 'dotProduct';

export type SearchIndexConfig = {
  lexical?: {
    fields: string[];
    language?: string;
  };
  vector?: {
    field: string;
    metric?: SearchMetric;
  };
  hybrid?: {
    fusion?: 'rrf';
    weights?: {
      lexical: number;
      vector: number;
    };
    defaultCandidates?: number;
  };
  filters?: { exclude: string[]; fields?: never } | { fields: string[]; exclude?: never };
};

export type SearchFieldPath = {
  path: string;
  localized: boolean;
};

export type SearchFilterField = SearchFieldPath & {
  type: 'boolean' | 'date' | 'id' | 'number' | 'string';
  many: boolean;
};

export type SearchIndexDescriptor = {
  name: string;
  lexical?: {
    fields: SearchFieldPath[];
    language?: string;
  };
  vector?: SearchFieldPath & {
    dimensions: number;
    metric: SearchMetric;
  };
  hybrid?: {
    fusion: 'rrf';
    weights: { lexical: number; vector: number };
    defaultCandidates: number;
  };
  filterFields: Record<string, SearchFilterField>;
};

export type SearchIndexDescriptors = Record<string, SearchIndexDescriptor>;

export type SearchCollection = {
  slug: string;
  search: SearchIndexDescriptors;
};

export type SearchMode = 'lexical' | 'vector' | 'hybrid';

export type SearchQuery = {
  text?: string;
  vector?: number[];
};

export type SearchComponentRanking = {
  method: string;
  higherIsBetter: boolean;
  approximate: boolean;
};

export type SearchRanking = SearchComponentRanking & {
  components?: {
    lexical: SearchComponentRanking;
    vector: SearchComponentRanking;
  };
};

export type SearchOptions<T extends CollectionSlug = CollectionSlug> = {
  collection: T;
  index: string;
  query: SearchQuery;
  where?: Where;
  limit?: number;
  candidates?: number;
  select?: SelectType;
  depth?: number;
  draft?: boolean;
  locale?: string;
  fallbackLocale?: false | TypedLocale;
  overrideAccess?: boolean;
  req?: FrogBotRequest;
};

export type SearchHitComponent = {
  rank: number;
  score: number;
};

export type SearchHitComponents = {
  lexical: SearchHitComponent | null;
  vector: SearchHitComponent | null;
};

export type SearchHit<T extends CollectionSlug = CollectionSlug> = {
  doc: TypedCollection<T>;
  score: number;
  components?: SearchHitComponents;
};

export type SearchResult<T extends CollectionSlug = CollectionSlug> = {
  mode: SearchMode;
  ranking: SearchRanking;
  hits: SearchHit<T>[];
};
