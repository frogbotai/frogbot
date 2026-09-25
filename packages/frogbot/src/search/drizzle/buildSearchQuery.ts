import {
  buildQuery,
  type BuildQueryJoinAliases,
  type DrizzleAdapter,
  type GenericColumn,
  type GenericTable,
} from '@payloadcms/drizzle';
import type { SQL } from 'drizzle-orm';
import {
  appendVersionToQueryKey,
  buildVersionCollectionFields,
  combineQueries,
  type Where,
} from 'payload';

import { SearchReadinessError } from '../errors.js';
import { getSearchTableName } from './getSearchTableName.js';

export type SearchQueryParts = {
  columns: GenericColumn[];
  filter: {
    joins: BuildQueryJoinAliases;
    where: SQL | undefined;
  };
  id: GenericColumn;
  joins: BuildQueryJoinAliases;
  rowID: GenericColumn;
  table: GenericTable;
};

export function buildSearchQuery({
  adapter,
  collection: slug,
  draft,
  locale,
  paths,
  where,
}: {
  adapter: DrizzleAdapter;
  collection: string;
  draft: boolean;
  locale: string | null | undefined;
  paths: string[];
  where: Where;
}): SearchQueryParts {
  const collection = adapter.payload.collections[slug].config;
  const versions = draft && Boolean(collection.versions?.drafts);
  const tableName = getSearchTableName({ adapter, collection: slug, versions });
  const table = tableName ? adapter.tables[tableName] : undefined;

  if (!tableName || !table) {
    throw new SearchReadinessError(`Collection '${slug}' has no searchable table.`);
  }

  const fields = versions
    ? buildVersionCollectionFields(adapter.payload.config, collection, true)
    : collection.flattenedFields;

  const filter = buildQuery({
    adapter,
    fields,
    locale: locale ?? undefined,
    tableName,
    where: versions
      ? combineQueries({ latest: { equals: true } }, appendVersionToQueryKey(where))
      : where,
  });

  const joins: BuildQueryJoinAliases = [];

  const columns = paths.map((path) => {
    const { orderBy } = buildQuery({
      adapter,
      fields,
      joins,
      locale: locale ?? undefined,
      sort: [versions ? `version.${path}` : path],
      tableName,
      where: {},
    });

    if (orderBy.length < 2) {
      throw new SearchReadinessError(`Search field '${path}' has no column in '${slug}'.`);
    }

    return orderBy[0].column;
  });

  return {
    columns,
    filter: { joins: filter.joins, where: filter.where },
    id: versions ? table.parent : table.id,
    joins,
    rowID: table.id,
    table,
  };
}
