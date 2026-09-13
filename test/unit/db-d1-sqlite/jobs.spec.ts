import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { BasePayload, buildConfig, createLocalReq, type Payload } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sqliteD1Adapter } from '../../../packages/db-d1-sqlite/src/index.js';
import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';
import {
  getJobLeaseContext,
  renewJobLease,
  resetJobLease,
  withJobLease,
} from '../../../packages/frogbot/src/jobs/lease.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

const sqlite = new DatabaseSync(':memory:');
const statements: { sql: string; params: SQLInputValue[]; method: 'raw' | 'run' }[] = [];
const binding = {
  prepare(query: string) {
    return {
      bind(...params: SQLInputValue[]) {
        return {
          async raw() {
            statements.push({ sql: query, params, method: 'raw' });

            return sqlite
              .prepare(query)
              .all(...params)
              .map((row) => Object.values(row));
          },
          async run() {
            statements.push({ sql: query, params, method: 'run' });

            const result = sqlite.prepare(query).run(...params);

            return {
              success: true,
              results: [],
              meta: { changes: result.changes, last_row_id: result.lastInsertRowid },
            };
          },
        };
      },
    };
  },
};

const descriptor = sqliteD1Adapter({ binding: binding as never, push: false });

const payload = new BasePayload();
let database: ReturnType<typeof descriptor.init>;

beforeAll(async () => {
  payload.logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Payload['logger'];

  payload.config = await buildConfig({
    secret: 'd1-jobs-test',
    db: descriptor,
    collections: [],
    jobs: resolveJobsConfig({ tasks: [{ slug: 'work', handler: async () => ({ output: {} }) }] }),
  });

  payload.collections = Object.fromEntries(
    payload.config.collections.map((config) => [config.slug, { config }]),
  ) as Payload['collections'];

  database = descriptor.init({ payload });
  payload.db = database;

  await database.init();
  await database.connect();

  sqlite.exec(
    'CREATE TABLE payload_jobs (id INTEGER PRIMARY KEY, processing INTEGER DEFAULT 0, lease_until TEXT, lease_owner TEXT, updated_at TEXT, created_at TEXT, completed_at TEXT, queue TEXT)',
  );
});

beforeEach(() => {
  sqlite.exec(
    "DELETE FROM payload_jobs; INSERT INTO payload_jobs (id, queue) VALUES (1, 'work'), (2, 'work'), (3, 'other')",
  );

  statements.length = 0;
});

afterAll(() => sqlite.close());

function claim(id?: number) {
  return withJobLease({
    payload,
    leaseDuration: 300_000,
    run: async () => {
      await database.updateJobs({
        ...(id === undefined
          ? { where: { queue: { equals: 'work' } }, limit: 1, sort: 'id' }
          : { id }),
        data: { processing: true },
        returning: false,
      });

      return getJobLeaseContext()!;
    },
  });
}

describe('D1 native driver claim and CAS', () => {
  it('executes UPDATE/subselect/RETURNING through the native raw binding method', async () => {
    const contexts = await Promise.all([claim(), claim()]);

    expect(contexts.map((context) => [...context.ids])).toEqual([[1], [2]]);
    expect(statements).toHaveLength(2);

    for (const statement of statements) {
      expect(statement.method).toBe('raw');
      expect(statement.sql).toMatch(/^update .* in \(select .* limit \?\)\) returning "id"$/);
      expect(statement.sql).not.toContain('skip locked');
    }

    const rows = sqlite.prepare('SELECT * FROM payload_jobs ORDER BY id').all();

    expect(rows.map((row) => row.processing)).toEqual([1, 1, 0]);
    expect(rows[0].lease_owner).toBe(contexts[0].owner);
    expect(rows[1].lease_owner).toBe(contexts[1].owner);
  });

  it('never claims an already processing ID', async () => {
    const first = await claim(1);
    const second = await claim(1);

    expect([...first.ids]).toEqual([1]);
    expect(second.ids.size).toBe(0);
    expect(
      sqlite.prepare('SELECT lease_owner FROM payload_jobs WHERE id = 1').get()!.lease_owner,
    ).toBe(first.owner);
  });

  it('preserves the conditional owner and expiry predicates in native CAS updates', async () => {
    const context = await claim(1);
    const req = await createLocalReq({}, payload);

    statements.length = 0;

    await renewJobLease({
      ids: Array.from({ length: 150 }, (_, index) => index + 1),
      owner: context.owner,
      req,
    });

    await resetJobLease({
      id: 1,
      owner: 'stale-owner',
      leaseUntil: '2020-01-01T00:00:00.000Z',
      req,
    });

    expect(statements).toHaveLength(2);
    expect(statements.every(({ method }) => method === 'run')).toBe(true);
    expect(statements[0].params.length).toBeLessThan(100);
    expect(
      sqlite.prepare('SELECT processing, lease_owner FROM payload_jobs WHERE id = 1').get(),
    ).toMatchObject({ processing: 1, lease_owner: context.owner });
  });
});
