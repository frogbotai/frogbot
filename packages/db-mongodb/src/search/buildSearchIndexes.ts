import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { SearchIndexDescriptor } from 'frogbot/search';

import {
  getIDFieldType,
  getSearchFields,
  getSearchLocales,
  getSearchPath,
} from './getSearchPath.js';
import type { SearchFieldType, SearchIndex, SearchIndexDefinition } from './types.js';

type FieldMapping = Record<string, unknown>;

const filterFieldTypes = {
  boolean: 'boolean',
  date: 'date',
  number: 'number',
  string: 'token',
} as const satisfies Record<string, SearchFieldType>;

function getSearchIndexName({ index, mode }: { index: string; mode: SearchIndex['mode'] }): string {
  return `${index}_${mode}`;
}

function getFilterFields({
  adapter,
  collection,
  index,
  versions,
}: {
  adapter: MongooseAdapter;
  collection: string;
  index: SearchIndexDescriptor;
  versions: boolean;
}): Map<string, SearchFieldType> {
  const fields = getSearchFields({ adapter, collection, versions });
  const filters = new Map<string, SearchFieldType>();

  if (versions) filters.set('latest', 'boolean');

  for (const filter of Object.values(index.filterFields)) {
    if (filter.many) continue;

    for (const locale of getSearchLocales(adapter)) {
      const { field, path } = getSearchPath({
        adapter,
        collection,
        fields,
        locale,
        path: filter.path,
        versions,
      });

      const relationTo =
        field && 'relationTo' in field && typeof field.relationTo === 'string'
          ? field.relationTo
          : collection;

      filters.set(
        path,
        filter.type === 'id'
          ? getIDFieldType({ adapter, collection: relationTo })
          : filterFieldTypes[filter.type],
      );
    }
  }

  return filters;
}

function getPaths({
  adapter,
  collection,
  path,
  versions,
}: {
  adapter: MongooseAdapter;
  collection: string;
  path: string;
  versions: boolean;
}): string[] {
  const fields = getSearchFields({ adapter, collection, versions });

  const paths = getSearchLocales(adapter).map(
    (locale) => getSearchPath({ adapter, collection, fields, locale, path, versions }).path,
  );

  return [...new Set(paths)];
}

function setFieldMapping({
  fields,
  mapping,
  path,
}: {
  fields: Record<string, FieldMapping | FieldMapping[]>;
  mapping: FieldMapping;
  path: string[];
}): void {
  const [segment, ...rest] = path;

  if (!rest.length) {
    const existing = fields[segment];

    fields[segment] = existing
      ? [...(Array.isArray(existing) ? existing : [existing]), mapping]
      : mapping;

    return;
  }

  fields[segment] ??= { type: 'document', dynamic: false, fields: {} };

  setFieldMapping({
    fields: (fields[segment] as { fields: Record<string, FieldMapping | FieldMapping[]> }).fields,
    mapping,
    path: rest,
  });
}

function buildLexicalDefinition({
  filters,
  index,
  textPaths,
}: {
  filters: Map<string, SearchFieldType>;
  index: SearchIndexDescriptor;
  textPaths: string[];
}): SearchIndexDefinition {
  const fields: Record<string, FieldMapping | FieldMapping[]> = {};
  const language = index.lexical?.language;

  for (const path of textPaths) {
    setFieldMapping({
      fields,
      mapping: { type: 'string', analyzer: `lucene.${language ?? 'standard'}` },
      path: path.split('.'),
    });
  }

  for (const [path, type] of filters) {
    setFieldMapping({ fields, mapping: { type }, path: path.split('.') });
  }

  return { mappings: { dynamic: false, fields } };
}

function buildVectorDefinition({
  filters,
  index,
  vectorPaths,
}: {
  filters: Map<string, SearchFieldType>;
  index: SearchIndexDescriptor;
  vectorPaths: string[];
}): SearchIndexDefinition {
  const vectors = vectorPaths.map((path) => ({
    type: 'vector',
    path,
    numDimensions: index.vector!.dimensions,
    similarity: index.vector!.metric,
  }));

  const filterPaths = [...filters.keys()].sort().map((path) => ({ type: 'filter', path }));

  return { fields: [...vectors, ...filterPaths] };
}

export function buildSearchIndexes({
  adapter,
  collection,
  index,
}: {
  adapter: MongooseAdapter;
  collection: string;
  index: SearchIndexDescriptor;
}): SearchIndex[] {
  const { config } = adapter.payload.collections[collection];
  const targets = config.versions?.drafts ? [false, true] : [false];

  return targets.flatMap((versions) => {
    const filters = getFilterFields({ adapter, collection, index, versions });
    const models: SearchIndex[] = [];

    if (index.lexical) {
      const textPaths = index.lexical.fields.flatMap(({ path }) =>
        getPaths({ adapter, collection, path, versions }),
      );

      models.push({
        collection,
        definition: buildLexicalDefinition({ filters, index, textPaths }),
        fields: filters,
        index: index.name,
        mode: 'lexical',
        name: getSearchIndexName({ index: index.name, mode: 'lexical' }),
        type: 'search',
        versions,
      });
    }

    if (index.vector) {
      const vectorPaths = getPaths({ adapter, collection, path: index.vector.path, versions });

      models.push({
        collection,
        definition: buildVectorDefinition({ filters, index, vectorPaths }),
        fields: filters,
        index: index.name,
        mode: 'vector',
        name: getSearchIndexName({ index: index.name, mode: 'vector' }),
        type: 'vectorSearch',
        versions,
      });
    }

    return models;
  });
}
