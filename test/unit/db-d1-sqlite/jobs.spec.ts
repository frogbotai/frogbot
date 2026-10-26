import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { BasePayload, buildConfig, type Payload } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sqliteD1Adapter } from '../../../packages/db-d1-sqlite/src/index.js';
import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

const sqlite = new DatabaseSync(':memory:');
const statements: { sql: string; params: SQLInputValue[]; method: 'raw' | 'run' }[] = [];
const binding = {
  prepare(query: string) {
    return {
      bind(...params: SQLInputValue[]) {
        return {
          raw() {
            statements.push({ sql: query, params, method: 'raw' });

            return Promise.resolve(
              sqlite
                .prepare(query)
                .all(...params)
                .map((row) => Object.values(row)),
            );
          },
          run() {
            statements.push({ sql: query, params, method: 'run' });

            const result = sqlite.prepare(query).run(...params);

            return Promise.resolve({
              success: true,
              results: [],
              meta: { changes: result.changes, last_row_id: result.lastInsertRowid },
            });
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
    jobs: resolveJobsConfig({ tasks: [{ slug: 'work', handler: () => ({ output: {} }) }] }),
  });

  payload.collections = Object.fromEntries(
    payload.config.collections.map((config) => [config.slug, { config }]),
  );

  database = descriptor.init({ payload });
  payload.db = database;

  if (!database.init || !database.connect) {
    throw new Error('The D1 adapter must define init and connect.');
  }

  await database.init();
  await database.connect();

  sqlite.exec(
    'CREATE TABLE payload_jobs (id INTEGER PRIMARY KEY, processing_until TEXT, processing_token TEXT, updated_at TEXT, created_at TEXT, completed_at TEXT, queue TEXT, concurrency_key TEXT)',
  );
});

beforeEach(() => {
  sqlite.exec(
    "DELETE FROM payload_jobs; INSERT INTO payload_jobs (id, queue) VALUES (1, 'work'), (2, 'work'), (3, 'other')",
  );

  statements.length = 0;
});

afterAll(() => sqlite.close());

async function claim(id?: number) {
  const token = `token-${Math.random()}`;

  await database.updateJobs({
    ...(id === undefined ? { where: { queue: { equals: 'work' } }, limit: 1, sort: 'id' } : { id }),
    data: { processingToken: token, processingUntil: new Date(Date.now() + 300_000).toISOString() },
    returning: false,
  });

  return token;
}

const holder = (id: number) =>
  sqlite.prepare('SELECT processing_token FROM payload_jobs WHERE id = ?').get(id)!
    .processing_token;

describe('D1 native driver claim', () => {
  it('executes UPDATE/subselect/RETURNING through the native raw binding method', async () => {
    const tokens = await Promise.all([claim(), claim()]);

    expect(statements).toHaveLength(2);

    for (const statement of statements) {
      expect(statement.method).toBe('raw');
      expect(statement.sql).toMatch(
        /^update .* in \(select .* limit \?\)\) returning "id", "concurrency_key"$/,
      );
      expect(statement.sql).not.toContain('skip locked');
    }

    expect([holder(1), holder(2)].sort()).toEqual([...tokens].sort());
    expect(holder(3)).toBeNull();
  });

  it('never claims an ID another run holds', async () => {
    const first = await claim(1);

    await claim(1);

    expect(holder(1)).toBe(first);
  });
});
