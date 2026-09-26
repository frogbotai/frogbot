export type SearchIndexType = 'search' | 'vectorSearch';

export type SearchFieldType = 'boolean' | 'date' | 'number' | 'objectId' | 'token';

export type SearchIndexDefinition = Record<string, unknown>;

export type SearchIndex = {
  collection: string;
  definition: SearchIndexDefinition;
  fields: Map<string, SearchFieldType>;
  index: string;
  mode: 'lexical' | 'vector';
  name: string;
  type: SearchIndexType;
  versions: boolean;
};

export type SearchRange = Partial<Record<'gt' | 'gte' | 'lt' | 'lte', unknown>>;

export type SearchFilterNode =
  | { type: 'and'; filters: SearchFilterNode[] }
  | { type: 'equals'; path: string; value: unknown }
  | { type: 'exists'; path: string }
  | { type: 'in'; path: string; values: unknown[] }
  | { type: 'not'; filter: SearchFilterNode }
  | { type: 'or'; filters: SearchFilterNode[] }
  | { type: 'range'; path: string; range: SearchRange };

export type SearchFilter = boolean | SearchFilterNode;
