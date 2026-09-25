// FrogBot's database adapter alias. Adapters are third-party packages
// (e.g. @payloadcms/db-mongodb, @payloadcms/db-postgres) that the user
// invokes and assigns to `db`. We accept whatever those packages return
// without referencing `payload` from the public surface; the internal
// mapping module is the only place that knows the precise runtime shape.
//
// The shape below matches every Payload-ecosystem adapter's factory
// return value: a small descriptor object whose `init` function binds
// the adapter to the host CMS at runtime.
//
// NOTE: the property name `payload` inside `init`'s args is NOT a
// FrogBot naming choice — it is the wire contract dictated by every
// adapter package. Renaming this key would break every adapter we
// accept. The type alias name (`DatabaseAdapter`) and where it surfaces
// in `FrogbotConfig` are ours; the shape belongs to the adapter
// ecosystem we deliberately stay compatible with.

import type {
  Field as PayloadField,
  JSONField as PayloadJSONField,
  Payload,
  PayloadRequest,
  Where,
} from 'payload';

import type {
  SearchCollection,
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
  index: SearchIndexDescriptor;
  mode: SearchMode;
};

export type SearchReadiness = (args: SearchReadinessArgs) => Promise<void> | void;

export type AdapterSearchArgs = {
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
  init: (args: { payload: any }) => unknown;
  defaultIDType: 'number' | 'text';
  name?: string;
  allowIDOnCreate?: boolean;
  mapVectorField?: MapVectorField;
  search?: SearchAdapter;
};
