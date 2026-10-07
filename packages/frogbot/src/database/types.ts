import type {
  Field as PayloadField,
  JSONField as PayloadJSONField,
  Payload,
  PayloadRequest,
  Where,
} from 'payload';

import type {
  SearchCollection,
  SearchHitComponents,
  SearchIndexDescriptor,
  SearchMode,
  SearchQuery,
  SearchRanking,
} from '../search/types.js';

export type SearchCapability =
  | 'supported'
  | { unsupported: 'engine-gap' | 'not-implemented' | 'missing-prerequisite'; detail: string };

export type SearchCapabilitiesArgs = {
  collection: string;
  db: Payload['db'];
  index: SearchIndexDescriptor;
};

export type SearchCapabilities = (
  args: SearchCapabilitiesArgs,
) => Record<SearchMode, SearchCapability>;

export type BuildSearchSchemaArgs = {
  collections: SearchCollection[];
  db: Payload['db'];
};

export type BuildSearchSchema = (args: BuildSearchSchemaArgs) => void;

export type SearchReadinessArgs = {
  collection: string;
  db: Payload['db'];
  draft: boolean;
  index: SearchIndexDescriptor;
  mode: SearchMode;
};

export type SearchReadiness = (args: SearchReadinessArgs) => Promise<void> | void;

export type AdapterSearchArgs = {
  candidates?: number;
  collection: string;
  db: Payload['db'];
  draft: boolean;
  fallbackLocale: PayloadRequest['fallbackLocale'];
  index: SearchIndexDescriptor;
  limit: number;
  locale: string | null | undefined;
  mode: SearchMode;
  query: SearchQuery;
  req: PayloadRequest;
  where: Where;
};

export type AdapterSearchRow = {
  components?: SearchHitComponents;
  id: number | string;
  score: number;
};

export type AdapterSearchResult = {
  ranking: SearchRanking;
  rows: AdapterSearchRow[];
};

export type AdapterSearch = (args: AdapterSearchArgs) => Promise<AdapterSearchResult>;

export type SearchAdapter = {
  buildSchema?: BuildSearchSchema;
  capabilities: SearchCapabilities;
  readiness?: SearchReadiness;
  search: AdapterSearch;
};

export type MapVectorFieldArgs = {
  block?: string;
  collection?: string;
  dimensions: number;
  field: PayloadJSONField;
  path: string;
};

export type MapVectorField = (args: MapVectorFieldArgs) => PayloadField;

export type DatabaseAdapter = {
  init: (args: { payload: Payload }) => unknown;
  defaultIDType: 'number' | 'text';
  name?: string;
  allowIDOnCreate?: boolean;
  mapVectorField?: MapVectorField;
  search?: SearchAdapter;
};
