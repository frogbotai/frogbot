import { buildQuery, type BuildQueryJoinAliases, type DrizzleAdapter } from '@payloadcms/drizzle';
import { eq, inArray, type SQL, sql, type SQLWrapper } from 'drizzle-orm';
import { buildVersionCollectionFields, type FlattenedField } from 'payload';
import toSnakeCase from 'to-snake-case';

import { assertDrizzleAdapter } from '../../database/guards.js';
import type { AdapterAggregateArgs, AdapterAggregateResult } from '../../database/types.js';
import type { AggregateDateUnit } from '../types.js';

export type AggregateSelect = {
  distinct?: boolean;
  fields: Record<string, SQL.Aliased>;
  /** A table, or a subquery from another select's `as`. */
  from: unknown;
  joins?: BuildQueryJoinAliases;
  where?: SQL;
  groupBy?: SQL[];
  orderBy?: SQL[];
  limit?: number;
  offset?: number;
};

export type AggregateSelectQuery = SQLWrapper & { as: (alias: string) => unknown };

export type AggregateDialect = {
  bucket: (column: SQL, unit: AggregateDateUnit) => SQL;
  /** Reads a string key as text, so keys sort the same way on every database. */
  text: (column: SQL) => SQL;
  select: (select: AggregateSelect) => AggregateSelectQuery;
  run: (args: {
    adapter: DrizzleAdapter;
    query: AggregateSelectQuery;
    req: AdapterAggregateArgs['req'];
  }) => Promise<Record<string, unknown>[]>;
};

const groupAlias = (index: number) => `frogbot_group_${index}`;

const valueAlias = (index: number) => `frogbot_value_${index}`;

const derived = (column: string) => sql`${sql.identifier('g')}.${sql.identifier(column)}`;

function resolveColumn({
  adapter,
  collection,
  fields,
  joins,
  locale,
  path,
  tableName,
}: {
  adapter: DrizzleAdapter;
  collection: string;
  fields: FlattenedField[];
  joins: BuildQueryJoinAliases;
  locale: string | undefined;
  path: string;
  tableName: string;
}): SQL {
  const fallback = adapter.tables[tableName].createdAt ? 'createdAt' : 'id';

  const { orderBy } = buildQuery({
    adapter,
    fields,
    joins,
    locale,
    sort: [path],
    tableName,
    where: {},
  });

  if (orderBy.length < (path === fallback ? 1 : 2)) {
    throw new Error(`[frogbot] Aggregate field '${path}' has no column in '${collection}'.`);
  }

  return sql`${orderBy[0].column}`;
}

/**
 * Matching documents, then one distinct row per document and group, then totals over those rows,
 * so no join can count a document twice in a group.
 */
export function createDrizzleAggregate(dialect: AggregateDialect) {
  return async ({
    collection,
    db,
    groupBy,
    limit,
    locale,
    page,
    req,
    sort,
    values,
    versions,
    where,
  }: AdapterAggregateArgs): Promise<AdapterAggregateResult> => {
    const adapter = assertDrizzleAdapter(db, 'Aggregate');
    const config = adapter.payload.collections[collection].config;

    const tableName = adapter.tableNameMap.get(
      versions ? `_${toSnakeCase(collection)}${adapter.versionsSuffix}` : toSnakeCase(collection),
    );

    const table = tableName ? adapter.tables[tableName] : undefined;

    const queryFields = versions
      ? buildVersionCollectionFields(adapter.payload.config, config, true)
      : config.flattenedFields;

    if (!tableName || !table) {
      throw new Error(`[frogbot] Collection '${collection}' has no table to aggregate.`);
    }

    const requestedLocale = locale ?? undefined;

    const filter = buildQuery({
      adapter,
      fields: queryFields,
      locale: requestedLocale,
      tableName,
      where,
    });

    const matching = filter.joins.length
      ? inArray(
          table.id,
          dialect.select({
            fields: { id: sql`${table.id}`.as('id') },
            from: table,
            joins: filter.joins,
            where: filter.where,
          }),
        )
      : filter.where;

    const keyJoins: BuildQueryJoinAliases = [];
    const keyFields: Record<string, SQL.Aliased> = { id: sql`${table.id}`.as('id') };

    for (const [index, { by, path, type }] of groupBy.entries()) {
      const column = resolveColumn({
        adapter,
        collection,
        fields: queryFields,
        joins: keyJoins,
        locale: requestedLocale,
        path,
        tableName,
      });

      const key = by
        ? dialect.bucket(column, by)
        : type === 'string'
          ? dialect.text(column)
          : column;

      keyFields[`k${index}`] = key.as(`k${index}`);
    }

    const keys = dialect.select({
      distinct: true,
      fields: keyFields,
      from: table,
      joins: keyJoins,
      where: matching,
    });

    const valueJoins: BuildQueryJoinAliases = [
      { type: 'innerJoin', table, condition: eq(table.id, derived('id')) },
    ];

    const fields: Record<string, SQL.Aliased> = {};
    const groupColumns = groupBy.map((_, index) => derived(`k${index}`));

    for (const [index, column] of groupColumns.entries()) {
      fields[groupAlias(index)] = column.as(groupAlias(index));
    }

    for (const [index, value] of values.entries()) {
      const total =
        value.operation === 'count'
          ? sql`count(*)`
          : sql`${sql.raw(value.operation)}(${resolveColumn({
              adapter,
              collection,
              fields: queryFields,
              joins: valueJoins,
              locale: requestedLocale,
              path: value.path,
              tableName,
            })})`;

      fields[valueAlias(index)] = total.as(valueAlias(index));
    }

    const totals: AggregateSelect = {
      fields,
      from: keys.as('g'),
      joins: valueJoins,
      groupBy: groupColumns,
    };

    const orderBy = sort.map(
      ({ direction, index, target }) =>
        sql`${sql.identifier(target === 'group' ? groupAlias(index) : valueAlias(index))} ${sql.raw(direction)} nulls last`,
    );

    const rows = await dialect.run({
      adapter,
      query: dialect.select({
        ...totals,
        orderBy,
        ...(limit ? { limit, offset: (page - 1) * limit } : {}),
      }),
      req,
    });

    let totalDocs = rows.length;

    if (limit) {
      const [count] = await dialect.run({
        adapter,
        query: dialect.select({
          fields: { total: sql`count(*)`.as('total') },
          from: dialect.select(totals).as('t'),
        }),
        req,
      });

      totalDocs = Number(count?.total ?? 0);
    }

    return {
      rows: rows.map((row) => ({
        group: groupBy.map((_, index) => row[groupAlias(index)]),
        values: values.map((_, index) => row[valueAlias(index)]),
      })),
      totalDocs,
    };
  };
}
