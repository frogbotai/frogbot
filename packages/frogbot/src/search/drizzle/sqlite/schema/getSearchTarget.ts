import type { DrizzleAdapter } from '@payloadcms/drizzle';

import type { SearchFieldPath, SearchIndexDescriptor } from '../../../types.js';
import { getSearchTableName } from '../../getSearchTableName.js';
import { resolveSearchColumn } from '../../resolveSearchColumn.js';
import { getTokenizer } from '../tokenizers.js';
import type {
  SearchColumn,
  SearchLocales,
  SearchRowKey,
  SearchTarget,
  SQLiteSearchAdapter,
} from '../types.js';

function fail(collection: string, index: string, reason: string): never {
  throw new Error(`[frogbot] Search index '${index}' in collection '${collection}': ${reason}.`);
}

export function getSearchTarget({
  adapter,
  collection,
  index,
  versions,
}: {
  adapter: SQLiteSearchAdapter;
  collection: string;
  index: SearchIndexDescriptor;
  versions: boolean;
}): SearchTarget {
  const drizzleAdapter = adapter as unknown as DrizzleAdapter;
  const table = getSearchTableName({ adapter: drizzleAdapter, collection, versions });
  const columns = table ? adapter.rawTables[table]?.columns : undefined;

  if (!table || !columns) fail(collection, index.name, 'the collection has no table');

  const localesTable = `${table}${adapter.localesSuffix ?? ''}`;

  const resolve = ({ path }: SearchFieldPath): SearchColumn => {
    const column = resolveSearchColumn({ adapter: drizzleAdapter, collection, path, versions });

    if (!column) fail(collection, index.name, `field '${path}' has no column in '${table}'`);

    return {
      name: adapter.rawTables[column.tableName].columns[column.key].name,
      localized: column.tableName !== table,
    };
  };

  const lexicalColumns = index.lexical?.fields.map(resolve);
  const vectorColumn = index.vector ? resolve(index.vector) : undefined;
  const localeColumns = adapter.rawTables[localesTable]?.columns;

  const locales: SearchLocales | undefined =
    localeColumns && (lexicalColumns?.some(({ localized }) => localized) || vectorColumn?.localized)
      ? {
          locale: localeColumns._locale.name,
          parent: localeColumns._parentID.name,
          table: localesTable,
        }
      : undefined;

  const getKey = (localized: boolean): SearchRowKey =>
    localized ? 'locales' : columns.id?.type === 'integer' ? 'table' : 'keys';

  const name = `frogbot_search_${table}_${index.name.replaceAll('-', '_')}`;

  let lexical: SearchTarget['lexical'];

  if (index.lexical && lexicalColumns) {
    const tokenize = getTokenizer(index.lexical.language);

    if (!tokenize) {
      fail(collection, index.name, `lexical.language '${index.lexical.language}' has no FTS5 tokenizer`);
    }

    const reserved = lexicalColumns.find(({ name: column }) =>
      ['rank', 'rowid'].includes(column.toLowerCase()),
    );

    if (reserved) fail(collection, index.name, `FTS5 reserves the column name '${reserved.name}'`);

    lexical = {
      columns: lexicalColumns,
      key: getKey(lexicalColumns.some(({ localized }) => localized)),
      table: `${name}_fts`,
      tokenize,
    };
  }

  let vector: SearchTarget['vector'];

  if (index.vector && vectorColumn) {
    const { approximate, dimensions, metric } = index.vector;

    if (metric === 'dotProduct') {
      fail(collection, index.name, 'LibSQL has no inner product vector distance');
    }

    vector = {
      ...vectorColumn,
      dimensions,
      metric,
      ...(approximate
        ? {
            index: {
              key: getKey(vectorColumn.localized),
              name: `${name}_vectors_idx`,
              table: `${name}_vectors`,
            },
          }
        : {}),
    };
  }

  const keys =
    lexical?.key === 'keys' || vector?.index?.key === 'keys' ? `${name}_keys` : undefined;

  return {
    collection,
    name,
    table,
    ...(versions ? { parent: columns.parent.name } : {}),
    ...(locales ? { locales } : {}),
    ...(keys ? { keys } : {}),
    ...(lexical ? { lexical } : {}),
    ...(vector ? { vector } : {}),
  };
}
