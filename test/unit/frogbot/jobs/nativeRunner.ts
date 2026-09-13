import type { Job, UpdateJobsArgs } from 'payload';
import { vi } from 'vitest';

import { getJobClaimFields, recordJobClaims } from '../../../../packages/frogbot/src/jobs/lease.js';
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

  database.beginTransaction = vi.fn(async () => null);
  database.commitTransaction = vi.fn(async () => undefined);
  database.rollbackTransaction = vi.fn(async () => undefined);
  database.find = vi.fn(async ({ where }) => ({
    docs: structuredClone(rows.filter((row) => !where || matches(row, where))),
  })) as typeof database.find;
  database.findOne = vi.fn(async ({ where }) =>
    structuredClone(rows.find((row) => !where || matches(row, where)) ?? null),
  ) as typeof database.findOne;
  database.updateOne = vi.fn(async ({ id, data }) =>
    write({ id: id!, data }),
  ) as typeof database.updateOne;

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
