import type { DatabaseAdapter, Payload, Where } from 'payload';
import { BasePayload, buildConfig, createLocalReq } from 'payload';
import { vi } from 'vitest';

import { resolveJobsConfig } from '../../../../packages/frogbot/src/jobs/config.js';
import type { JobLeaseMutation } from '../../../../packages/frogbot/src/jobs/lease.js';
import { jobLeaseOperations } from '../../../../packages/frogbot/src/jobs/lease.js';
import { withJobsRuntime } from '../../../../packages/frogbot/src/jobs/runtime.js';
import type { Jobs, JobsConfig } from '../../../../packages/frogbot/src/jobs/types.js';

export type LeaseRow = {
  id: number;
  processing: boolean;
  leaseOwner?: string | null;
  leaseUntil?: string | null;
  completedAt?: string;
};

export function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'and') return (value as Where[]).every((part) => matches(row, part));

    if (key === 'or') return (value as Where[]).some((part) => matches(row, part));

    return Object.entries(value).every(([operator, expected]) => {
      const actual = row[key];

      if (operator === 'equals') return actual === expected;

      if (operator === 'in') return (expected as unknown[]).includes(actual);

      if (operator === 'exists') return (actual !== undefined && actual !== null) === expected;

      if (operator === 'greater_than') {
        return typeof actual === 'string' && actual > String(expected);
      }

      if (operator === 'less_than_equal') {
        return typeof actual === 'string' && actual <= String(expected);
      }

      throw new Error(`Unexpected operator ${operator}`);
    });
  });
}

export async function setup({
  jobs = {},
  rows = [],
}: { jobs?: JobsConfig; rows?: LeaseRow[] } = {}) {
  const payload = new BasePayload();

  const operations = {
    update: vi.fn(async ({ data, where }: JobLeaseMutation) => {
      for (const row of rows) if (matches(row, where)) Object.assign(row, data);
    }),
  };

  const database = {
    name: 'mongoose',
    create: vi.fn(async ({ data }) => ({ id: 1, ...data })),
    updateJobs: vi.fn(async () => []),
    find: vi.fn(async ({ where }) => ({ docs: rows.filter((row) => matches(row, where)) })),
    deleteMany: vi.fn(async () => undefined),
    [jobLeaseOperations]: operations,
  } as unknown as DatabaseAdapter;

  payload.logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Payload['logger'];

  const config = resolveJobsConfig({
    tasks: [{ slug: 'work', handler: async () => ({ output: {} }) }],
    ...jobs,
  });

  payload.config = await buildConfig({
    secret: 'jobs-test-secret',
    collections: [],
    jobs: config,
    db: withJobsRuntime({
      adapter: { defaultIDType: 'number', init: () => database },
      leaseDuration: config.leaseDuration,
    }),
  });

  const req = await createLocalReq({}, payload);

  return {
    payload,
    req,
    operations,
    database,
    install: () => {
      payload.config.db.init({ payload });

      return payload.jobs as Jobs;
    },
  };
}
