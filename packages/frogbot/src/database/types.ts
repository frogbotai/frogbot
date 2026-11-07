import type {
  Field as PayloadField,
  JSONField as PayloadJSONField,
  Payload,
  PayloadRequest,
  Where,
} from 'payload';

import type {
  AggregateGroupDescriptor,
  AggregateSortDescriptor,
  AggregateValueDescriptor,
} from '../aggregate/types.js';
import type { FrogBotSanitizedConfig } from '../config/sanitized.js';
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

/**
 * One aggregate query. `where` already holds every access, trash and draft rule; the adapter only
 * translates it. Each document counts once per group, whatever joins the paths need.
 */
export type AdapterAggregateArgs = {
  collection: string;
  db: Payload['db'];
  groupBy: AggregateGroupDescriptor[];
  values: AggregateValueDescriptor[];
  sort: AggregateSortDescriptor[];
  /** Groups per page; `undefined` returns every group. */
  limit?: number;
  page: number;
  locale: string | null | undefined;
  req: PayloadRequest;
  where: Where;
};

/** One group: its keys in `groupBy` order and its totals in `values` order, as the database returns them. */
export type AdapterAggregateRow = {
  group: unknown[];
  values: unknown[];
};

export type AdapterAggregateResult = {
  rows: AdapterAggregateRow[];
  /** The number of groups across every page. */
  totalDocs: number;
};

export type AdapterAggregate = (args: AdapterAggregateArgs) => Promise<AdapterAggregateResult>;

export type AggregateAdapter = {
  aggregate: AdapterAggregate;
};

export type MapVectorFieldArgs = {
  block?: string;
  collection?: string;
  dimensions: number;
  field: PayloadJSONField;
  path: string;
};

export type MapVectorField = (args: MapVectorFieldArgs) => PayloadField;

export type DatabaseSnapshotRow = Record<string, unknown>;

/** An open connection to a database copy that nothing else uses. */
export type DatabaseSnapshot = {
  /** The absolute path of the database file the copy was taken from. */
  source: string;
  all: (sql: string) => Promise<DatabaseSnapshotRow[]>;
  run: (sql: string) => Promise<void>;
  close: () => Promise<void>;
};

export type DatabaseSnapshotArgs = {
  /** Where relative database paths resolve, as the app's own process would. */
  cwd: string;
  /** A path that doesn't exist yet. */
  to: string;
};

/** Copies the database to `to` without waiting on its writers. `undefined` when there is no database yet. */
export type SnapshotDatabase = (
  args: DatabaseSnapshotArgs,
) => Promise<DatabaseSnapshot | undefined>;

/** What a schema sync applied (`applied`), the removed tables and columns it kept (`kept`), and why it refused. */
export type SchemaSyncResult =
  | { ok: true; applied: string[]; kept: string[] }
  | { ok: false; error: string; applied: string[]; kept: string[] };

/**
 * Brings the database's schema up to the config's without deleting data: adds tables, columns and indexes,
 * keeps removed ones, and applies nothing that would drop a table, a column or rows.
 */
export type SyncSchema = (args: { config: FrogBotSanitizedConfig }) => Promise<SchemaSyncResult>;

export type DatabaseAdapter = {
  init: (args: { payload: Payload }) => unknown;
  defaultIDType: 'number' | 'text';
  name?: string;
  allowIDOnCreate?: boolean;
  aggregate?: AggregateAdapter;
  mapVectorField?: MapVectorField;
  search?: SearchAdapter;
  snapshot?: SnapshotDatabase;
  /** Set when the adapter syncs its own schema; `frogbot up` runs it before each new server. */
  syncSchema?: SyncSchema;
  /** The adapter's `prodMigrations`, or `null` without them; `frogbot deploy` checks they're wired. */
  prodMigrations?: readonly unknown[] | null;
};
