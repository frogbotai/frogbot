import type { DatabaseAdapter, Payload, Where } from 'payload';
import { BasePayload, buildConfig, createPayloadRequest } from 'payload';
import { vi } from 'vitest';

import { resolveJobsConfig } from '../../../../packages/frogbot/src/jobs/config.js';
import { withJobsRuntime } from '../../../../packages/frogbot/src/jobs/runtime.js';
import type { Jobs, JobsConfig } from '../../../../packages/frogbot/src/jobs/types.js';

export type LeaseRow = {
  id: number;
  processingToken?: string | null;
  processingUntil?: string | null;
  completedAt?: string | null;
};

export function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'and') return (value as Where[]).every((part) => matches(row, part));

    if (key === 'or') return (value as Where[]).some((part) => matches(row, part));

    return Object.entries(value).every(([operator, expected]) => {
      const actual = row[key];

      if (operator === 'equals') return actual === expected;

      if (operator === 'not_equals') return actual !== expected;

      if (operator === 'in') return (expected as unknown[]).includes(actual);

      if (operator === 'exists') return (actual !== undefined && actual !== null) === expected;

      if (operator === 'greater_than') {
        return typeof actual === 'string' && actual > String(expected);
      }

      if (operator === 'less_than') {
        return typeof actual === 'string' && actual < String(expected);
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

  const database = {
    name: 'mongoose',
    create: vi.fn(({ data }) => Promise.resolve({ id: 1, ...data })),
    updateJobs: vi.fn(() => Promise.resolve([])),
    find: vi.fn(({ where }) =>
      Promise.resolve({ docs: rows.filter((row) => matches(row, where)) }),
    ),
    deleteMany: vi.fn(() => Promise.resolve()),
  } as unknown as DatabaseAdapter;

  payload.logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Payload['logger'];

  const config = resolveJobsConfig({
    tasks: [{ slug: 'work', handler: () => ({ output: {} }) }],
    ...jobs,
  });

  payload.config = await buildConfig({
    secret: 'jobs-test-secret',
    collections: [],
    jobs: config,
    db: withJobsRuntime({ adapter: { defaultIDType: 'number', init: () => database } }),
  });

  const req = await createPayloadRequest({ payload: payload });

  return {
    payload,
    req,
    database,
    install: () => {
      payload.config.db.init({ payload });

      return payload.jobs as Jobs;
    },
  };
}
