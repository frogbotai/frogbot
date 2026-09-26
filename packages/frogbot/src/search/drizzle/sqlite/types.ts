import type { BaseSQLiteAdapter, MigrateUpArgs } from '@payloadcms/drizzle/sqlite';

export type SearchDatabase = MigrateUpArgs['db'];

export type SQLiteSearchAdapter = BaseSQLiteAdapter & {
  clientConfig?: { url?: string };
  drizzle: SearchDatabase;
};

export type SearchObject = {
  name: string;
  sql: string;
  type: 'index' | 'table' | 'trigger';
};

export type SearchObjectGroup = {
  objects: SearchObject[];
  populate: string[];
  tables: string[];
};

export type SearchSchema = Record<string, SearchObjectGroup>;

export type SearchRowKey = 'keys' | 'locales' | 'table';

export type SearchLocales = {
  locale: string;
  parent: string;
  table: string;
};

export type SearchColumn = {
  localized: boolean;
  name: string;
};

export type SearchTarget = {
  collection: string;
  keys?: string;
  lexical?: {
    columns: SearchColumn[];
    key: SearchRowKey;
    table: string;
    tokenize: string;
  };
  locales?: SearchLocales;
  name: string;
  parent?: string;
  table: string;
  vector?: SearchColumn & {
    dimensions: number;
    index?: {
      key: SearchRowKey;
      name: string;
      table: string;
    };
    metric: 'cosine' | 'euclidean';
  };
};
