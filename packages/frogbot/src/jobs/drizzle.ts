import { buildIndexName, buildQuery, type DrizzleAdapter, find } from '@payloadcms/drizzle';
import {
  and,
  asc,
  eq,
  getTableName,
  inArray,
  is,
  isNull,
  lte,
  max,
  min,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import {
  PgDatabase,
  type PgTable,
  QueryBuilder as PgQueryBuilder,
  uniqueIndex as pgUniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  type BaseSQLiteDatabase,
  QueryBuilder as SQLiteQueryBuilder,
  type SQLiteTable,
  uniqueIndex as sqliteUniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { DatabaseAdapter, Job, PayloadRequest, Sort, Where } from 'payload';

import {
  assertDrizzleAdapter,
  assertPostgresAdapter,
  assertSQLiteAdapter,
} from '../database/guards.js';
import { type JobInsertDatabase, jobInsertOperations } from './insert.js';
import { type JobLogDatabase, jobLogOperations } from './log.js';
import { isJobClaim, unleased } from './run.js';

type JobSQLDialect = 'postgres' | 'sqlite';

type JobDatabase = Awaited<ReturnType<typeof getJobDatabase>>;

type JobTable = DrizzleAdapter['tables'][string];

type JobSQLiteWriter = Pick<BaseSQLiteDatabase<'async', unknown>, 'delete' | 'update'>;

const feature = 'FrogBot SQL jobs';

async function claimJobRows({
  db,
  table,
  data,
  where,
}: {
  db: JobDatabase;
  table: JobTable;
  data: Record<string, unknown>;
  where: SQL | undefined;
}): Promise<(number | string)[]> {
  if (is(db, PgDatabase)) {
    const rows = await db.update(table).set(data).where(where).returning({ id: table.id });

    return rows.map((row) => row.id);
  }

  const writer: JobSQLiteWriter = db;
  const rows = await writer.update(table).set(data).where(where).returning({ id: table.id });

  return rows.map((row) => row.id);
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
    candidates = where
      ? sql`select ${table.id} from ${table} where ${where}`
      : sql`select ${table.id} from ${table}`;

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
  const adapter = assertDrizzleAdapter(database, feature);
  const updateJobs = database.updateJobs;
  const inserts = new Map<string | number, Promise<void>>();

  (database as JobInsertDatabase)[jobInsertOperations] = {
    async insert({ req, insert }) {
      const transactionID = await req?.transactionID;

      if (dialect !== 'postgres' || !transactionID) return insert();

      const db = adapter.sessions[transactionID]?.db as
        { execute(query: SQL): Promise<unknown> } | undefined;

      if (!db) return insert();

      const previous = inserts.get(transactionID);
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });

      inserts.set(transactionID, pending);

      await previous;

      try {
        await db.execute(sql`SAVEPOINT frogbot_job_insert`);

        try {
          const result = await insert();

          await db.execute(sql`RELEASE SAVEPOINT frogbot_job_insert`);

          return result;
        } catch (error) {
          await db.execute(sql`ROLLBACK TO SAVEPOINT frogbot_job_insert`);
          await db.execute(sql`RELEASE SAVEPOINT frogbot_job_insert`);

          throw error;
        }
      } finally {
        release();

        if (inserts.get(transactionID) === pending) inserts.delete(transactionID);
      }
    },
  };

  (database as JobLogDatabase)[jobLogOperations] = {
    async prune({ id, keep, req }) {
      const tableName = adapter.tableNameMap.get('payload_jobs');
      const logTableName = tableName && adapter.tableNameMap.get(`${tableName}_log`);
      const jobs = tableName && adapter.tables[tableName];
      const table = logTableName && adapter.tables[logTableName];

      if (!jobs || !table) throw new Error('FrogBot jobs log table is unavailable.');

      const live = sql`exists (select 1 from ${jobs} where ${jobs.id} = ${id} and ${jobs.completedAt} is null and ${jobs.hasError} is not true)`;
      const db = await getJobDatabase(adapter, req);
      const where = and(
        eq(table._parentID, id),
        keep.length ? notInArray(table.id, keep) : undefined,
        live,
      );

      if (is(db, PgDatabase)) {
        await db.delete(table).where(where);
      } else {
        const writer: JobSQLiteWriter = db;

        await writer.delete(table).where(where);
      }

      adapter.lastWriteTimestamp = Date.now();
    },
  };

  const getLiveJobIndex = () => {
    const tableName = adapter.tableNameMap.get('payload_jobs');

    if (!tableName) return undefined;

    const name = buildIndexName({ adapter, name: 'payload_jobs_job_id_live' });
    const falseLiteral = sql.raw(dialect === 'sqlite' ? '0' : 'false');
    const where = (columns: Record<string, unknown>) =>
      sql`${columns.jobId} is not null and ${columns.completedAt} is null and coalesce(${columns.hasError}, ${falseLiteral}) = ${falseLiteral}`;

    return { name, tableName, where };
  };

  if (dialect === 'postgres') {
    assertPostgresAdapter(database, feature).afterSchemaInit.push(({ extendTable, schema }) => {
      const index = getLiveJobIndex();

      if (!index) return schema;

      extendTable({
        table: schema.tables[index.tableName],
        extraConfig: (columns) => ({
          [index.name]: pgUniqueIndex(index.name).on(columns.jobId).where(index.where(columns)),
        }),
      });

      return schema;
    });
  } else {
    assertSQLiteAdapter(database, feature).afterSchemaInit.push(({ extendTable, schema }) => {
      const index = getLiveJobIndex();

      if (!index) return schema;

      extendTable({
        table: schema.tables[index.tableName],
        extraConfig: (columns) => ({
          [index.name]: sqliteUniqueIndex(index.name).on(columns.jobId).where(index.where(columns)),
        }),
      });

      return schema;
    });
  }

  database.updateJobs = async (args) => {
    if (!isJobClaim(args.data)) return updateJobs.call(database, args);

    const sort = args.sort ?? adapter.payload.collections['payload-jobs'].config.defaultSort;
    const now = new Date().toISOString();

    const query = getJobQuery({
      adapter,
      sort,
      where: {
        and: [
          ...(args.where ? [args.where] : []),
          ...(args.id !== undefined ? [{ id: { equals: args.id } }] : []),
          unleased(now),
        ],
      },
    });

    const data: Record<string, unknown> = { ...args.data, updatedAt: args.data.updatedAt ?? now };

    for (const key of Object.keys(data)) {
      if (!(key in query.table)) throw new Error(`FrogBot job claims cannot write "${key}".`);
    }

    const db = await getJobDatabase(adapter, args.req);
    const candidates = getJobCandidates({
      query,
      dialect,
      limit: args.id !== undefined ? 1 : args.limit,
    });

    const ids = await claimJobRows({
      db,
      table: query.table,
      data,
      where: and(
        or(isNull(query.table.processingUntil), lte(query.table.processingUntil, now)),
        inArray(query.table.id, sql`(${candidates})`),
      ),
    });

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
        where: {
          and: [{ id: { in: ids } }, { processingToken: { equals: args.data.processingToken } }],
        },
      },
    );

    return result.docs as Job[];
  };
}
