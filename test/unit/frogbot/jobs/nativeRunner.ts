import type { Job, UpdateJobsArgs } from 'payload';
import { vi } from 'vitest';

import { getJobClaimFields, recordJobClaims } from '../../../../packages/frogbot/src/jobs/lease.js';
import {
  type JobLogDatabase,
  jobLogOperations,
} from '../../../../packages/frogbot/src/jobs/log.js';
import type { JobsConfig } from '../../../../packages/frogbot/src/jobs/types.js';
import { matches, setup } from './helpers.js';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

export function jobRow(id: number, workflow = false): Job & { id: number; processing: boolean } {
  return {
    id,
    input: {},
    processing: false,
    queue: 'default',
    taskStatus: {},
    totalTried: 0,
    log: [],
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...(workflow ? { workflowSlug: 'work' } : { taskSlug: 'work' }),
  };
}

export async function nativeRunner({
  jobs,
  rows,
  beforeWrite,
  afterWrite,
}: {
  jobs: JobsConfig;
  rows: ReturnType<typeof jobRow>[];
  beforeWrite?: (args: { id: number | string; data: Partial<Job> }) => Promise<void>;
  afterWrite?: (args: { id: number | string; data: Partial<Job> }) => void;
}) {
  const runtime = await setup({ jobs: { tasks: [], ...jobs }, rows });
  const { database, payload } = runtime;

  for (const collection of payload.config.collections) {
    payload.collections[collection.slug] = { config: collection };
  }

  const write = async ({ id, data }: { id: number | string; data: Partial<Job> }) => {
    const row = rows.find((candidate) => candidate.id === id)!;

    await beforeWrite?.({ id, data });

    const { log, ...fields } = data;

    Object.assign(row, fields);

    if (log) {
      row.log = Array.isArray(log)
        ? structuredClone(log)
        : [
            ...(row.log ?? []),
            structuredClone((log as { $push: NonNullable<Job['log']>[number] }).$push),
          ];
    }

    afterWrite?.({ id, data });

    return structuredClone(row);
  };

  database.beginTransaction = vi.fn(() => Promise.resolve(null));
  database.commitTransaction = vi.fn(() => Promise.resolve());
  database.rollbackTransaction = vi.fn(() => Promise.resolve());
  database.find = vi.fn(({ where }) => {
    const docs = structuredClone(rows.filter((row) => !where || matches(row, where)));

    return Promise.resolve({
      docs,
      hasNextPage: false,
      hasPrevPage: false,
      limit: docs.length,
      pagingCounter: 1,
      totalDocs: docs.length,
      totalPages: 1,
    });
  }) as typeof database.find;
  database.findOne = vi.fn(({ where }) =>
    Promise.resolve(structuredClone(rows.find((row) => !where || matches(row, where)) ?? null)),
  ) as typeof database.findOne;
  database.packageName = '@frogbotai/db-mongodb';
  (database as JobLogDatabase)[jobLogOperations] = {
    prune: vi.fn(({ id, keep }) => {
      const row = rows.find((candidate) => candidate.id === id)!;

      if (!row.completedAt && !row.hasError) {
        row.log = (row.log ?? []).filter((entry) => keep.includes(entry.id));
      }

      return Promise.resolve();
    }),
  };

  database.updateOne = vi.fn(async ({ id, where, data }) => {
    const row = rows.find((candidate) =>
      id === undefined ? matches(candidate, where) : candidate.id === id,
    );

    return row ? write({ id: row.id, data }) : null;
  }) as typeof database.updateOne;

  database.updateJobs = vi.fn(async (args: UpdateJobsArgs) => {
    if (args.data.processing === true) {
      const candidates = rows
        .filter((row) => !row.processing && (args.id === undefined || row.id === args.id))
        .slice(0, args.limit ?? rows.length);
      const fields = getJobClaimFields();

      for (const row of candidates) {
        Object.assign(row, args.data, fields);
      }

      recordJobClaims(candidates.map(({ id }) => id));

      return structuredClone(candidates);
    }

    const candidates = rows.filter((row) => args.id === undefined || row.id === args.id);
    const result = [];

    for (const row of candidates) {
      result.push(await write({ id: row.id, data: args.data }));
    }

    return result;
  });

  runtime.install();

  return runtime;
}
