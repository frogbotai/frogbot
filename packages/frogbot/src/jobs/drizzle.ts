import {
  buildQuery,
  type DrizzleAdapter,
  find,
  type GenericColumn,
  type GenericTable,
} from '@payloadcms/drizzle';
import { and, asc, eq, getTableName, inArray, max, min, type SQL, sql } from 'drizzle-orm';
import { type PgTable, QueryBuilder as PgQueryBuilder } from 'drizzle-orm/pg-core';
import { QueryBuilder as SQLiteQueryBuilder, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { DatabaseAdapter, Job, PayloadRequest, Sort, Where } from 'payload';

import {
  getJobClaimFields,
  getJobLeaseContext,
  type JobLeaseDatabase,
  jobLeaseOperations,
  recordJobClaims,
} from './lease.js';

type JobSQLDialect = 'postgres' | 'sqlite';

type JobSQLUpdate = PromiseLike<unknown> & {
  returning: (fields: { id: GenericColumn }) => PromiseLike<{ id: number | string }[]>;
};

type JobSQLWriter = {
  update: (table: GenericTable) => {
    set: (data: Record<string, unknown>) => {
      where: (predicate: SQL | undefined) => JobSQLUpdate;
    };
  };
};

function getJobUpdate({
  db,
  table,
  data,
  where,
}: {
  db: Awaited<ReturnType<typeof getJobDatabase>>;
  table: GenericTable;
  data: Record<string, unknown>;
  where: SQL | undefined;
}): JobSQLUpdate {
  const writer = db as unknown as JobSQLWriter;

  return writer.update(table).set(data).where(where);
}

function getJoinedJobQuery({
  query,
  dialect,
  selections,
  groups,
}: {
  query: ReturnType<typeof getJobQuery>;
  dialect: JobSQLDialect;
  selections: Record<string, SQL | SQL.Aliased>;
  groups: SQL[];
}): SQL {
  if (dialect === 'postgres') {
    let joined = new PgQueryBuilder().select(selections).from(query.table).$dynamic();

    for (const { type, table, condition } of query.joins) {
      joined = joined[type ?? 'leftJoin'](table as PgTable, condition);
    }

    return joined
      .where(query.where)
      .groupBy(...groups)
      .getSQL();
  }

  let joined = new SQLiteQueryBuilder().select(selections).from(query.table).$dynamic();

  for (const { type, table, condition } of query.joins) {
    joined = joined[type ?? 'leftJoin'](table as SQLiteTable, condition);
  }

  return joined
    .where(query.where)
    .groupBy(...groups)
    .getSQL();
}

async function getJobDatabase(adapter: DrizzleAdapter, req?: Partial<PayloadRequest>) {
  const transactionID = await req?.transactionID;

  return (
    (transactionID && adapter.sessions[transactionID]?.db) ||
    adapter.primaryDrizzle ||
    adapter.drizzle
  );
}

function getJobQuery({
  adapter,
  where,
  sort,
}: {
  adapter: DrizzleAdapter;
  where: Where;
  sort?: Sort;
}) {
  const collection = adapter.payload.collections['payload-jobs'].config;
  const tableName = adapter.tableNameMap.get('payload_jobs');

  if (!tableName) throw new Error('FrogBot jobs table is unavailable.');

  const table = adapter.tables[tableName];
  const query = buildQuery({
    adapter,
    fields: collection.flattenedFields,
    tableName,
    where,
    sort: Array.isArray(sort) ? [...sort] : sort,
  });

  return { ...query, table };
}

function getJobCandidates({
  query,
  dialect,
  limit,
}: {
  query: ReturnType<typeof getJobQuery>;
  dialect: JobSQLDialect;
  limit?: number;
}): SQL {
  const { table, joins, orderBy, where } = query;
  let candidates: SQL;

  if (joins.length) {
    const manyTables = new Set(
      joins.filter((join) => join.isOneToMany).map((join) => getTableName(join.table)),
    );

    const groups: SQL[] = [sql`${table.id}`];
    const selections: Record<string, SQL | SQL.Aliased> = { id: sql`${table.id}`.as('id') };

    orderBy.forEach(({ column, order }, index) => {
      const many = manyTables.has(getTableName(column.table));

      if (!many) groups.push(sql`${column}`);

      const value = many ? (order === asc ? min(column) : max(column)) : column;

      selections[`order_${index}`] = sql`${value}`.as(`order_${index}`);
    });

    const joined = getJoinedJobQuery({ query, dialect, selections, groups });
    const eligible = sql.identifier('frogbot_job_candidates');

    candidates = sql`select ${table.id} from ${table} inner join (${joined}) ${eligible} on ${table.id} = ${eligible}.id`;

    if (orderBy.length) {
      candidates.append(
        sql` order by ${sql.join(
          orderBy.map(({ order }, index) =>
            order(sql`${eligible}.${sql.identifier(`order_${index}`)}`),
          ),
          sql`, `,
        )}`,
      );
    }
  } else {
    candidates = sql`select ${table.id} from ${table} where ${where}`;

    if (orderBy.length) {
      candidates.append(
        sql` order by ${sql.join(
          orderBy.map(({ column, order }) => order(column)),
          sql`, `,
        )}`,
      );
    }
  }

  if (limit && limit > 0) candidates.append(sql` limit ${limit}`);

  if (dialect === 'postgres') {
    candidates.append(sql` for update of ${sql.identifier(getTableName(table))} skip locked`);
  }

  return candidates;
}

export function installSQLJobOperations({
  adapter: database,
  dialect,
}: {
  adapter: Pick<DatabaseAdapter, 'updateJobs'>;
  dialect: JobSQLDialect;
}): void {
  const adapter = database as unknown as DrizzleAdapter;
  const updateJobs = database.updateJobs;

  database.updateJobs = async (args) => {
    if (args.data.processing !== true) return updateJobs.call(database, args);

    const context = getJobLeaseContext();

    if (!context || context.payload !== adapter.payload) {
      throw new Error('FrogBot job claims require an active jobs run for this runtime.');
    }

    const sort = args.sort ?? adapter.payload.collections['payload-jobs'].config.defaultSort;

    const query = getJobQuery({
      adapter,
      sort,
      where: {
        and: [
          ...(args.where ? [args.where] : []),
          ...(args.id !== undefined ? [{ id: { equals: args.id } }] : []),
          { processing: { equals: false } },
        ],
      },
    });

    const fields = getJobClaimFields();
    const data: Record<string, unknown> = {
      ...args.data,
      ...fields,
      updatedAt: args.data.updatedAt ?? new Date().toISOString(),
    };

    if (!data.log || (Array.isArray(data.log) && !data.log.length)) delete data.log;

    for (const key of Object.keys(data)) {
      if (!(key in query.table)) {
        throw new Error(`FrogBot job claims cannot write nested field "${key}".`);
      }
    }

    const db = await getJobDatabase(adapter, args.req);
    const candidates = getJobCandidates({
      query,
      dialect,
      limit: args.id !== undefined ? 1 : args.limit,
    });

    const rows = await getJobUpdate({
      db,
      table: query.table,
      data,
      where: and(eq(query.table.processing, false), inArray(query.table.id, sql`(${candidates})`)),
    }).returning({ id: query.table.id });

    const ids = rows.map((row) => row.id);

    recordJobClaims(ids);

    adapter.lastWriteTimestamp = Date.now();

    if (args.returning === false) return null;

    if (!ids.length) return [];

    const result = await find.call(
      { ...adapter, drizzle: db, primaryDrizzle: undefined },
      {
        collection: 'payload-jobs',
        limit: 0,
        pagination: false,
        sort: Array.isArray(sort) ? [...sort] : sort,
        where: { and: [{ id: { in: ids } }, { leaseOwner: { equals: fields.leaseOwner } }] },
      },
    );

    return result.docs as Job[];
  };

  (database as JobLeaseDatabase)[jobLeaseOperations] = {
    async update({ data, where, req }) {
      if (req.payload !== adapter.payload) {
        throw new Error('FrogBot job lease updates require a request for this runtime.');
      }

      const query = getJobQuery({ adapter, where });

      if (query.joins.length) throw new Error('FrogBot job lease predicates must use job fields.');

      const db = await getJobDatabase(adapter, req);

      await getJobUpdate({ db, table: query.table, data, where: query.where });

      adapter.lastWriteTimestamp = Date.now();
    },
  };
}
