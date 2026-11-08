import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { FrogBotRequest } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { sqliteSnapshot } from '../../../packages/db-sqlite/src/snapshot.js';
import type { DojoEnv } from '../../../packages/plugins/plugin-dojo/src/env.js';
import {
  databaseFile,
  dojoExportEndpoint,
} from '../../../packages/plugins/plugin-dojo/src/export.js';
import { tempDir } from './cli/helpers.js';

const env = { jobsSecret: 'jobs-secret' } as DojoEnv;
const key = '.dojo/export/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.db';

async function liveApp() {
  const dir = await tempDir();
  const path = join(dir, 'data', 'frogbot.db');

  await mkdir(join(dir, 'data'));

  const db = new DatabaseSync(path);

  db.exec(`
    CREATE TABLE deals (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO deals (name) VALUES ('Acme'), ('Globex');
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
    INSERT INTO users (email) VALUES ('maya@deals.test');
    CREATE TABLE users_sessions (id TEXT PRIMARY KEY, _parent_id INTEGER);
    INSERT INTO users_sessions VALUES ('s1', 1);
    CREATE TABLE payload_jobs (id INTEGER PRIMARY KEY, task_slug TEXT);
    INSERT INTO payload_jobs (task_slug) VALUES ('digest');
    CREATE TABLE payload_locked_documents (id INTEGER PRIMARY KEY);
    INSERT INTO payload_locked_documents DEFAULT VALUES;
  `);

  db.close();

  const uploaded: { key: string; tables: Record<string, number> }[] = [];
  const endpoint = dojoExportEndpoint({
    env,
    collections: [{ slug: 'deals' }, { slug: 'users', auth: true }],
    cwd: dir,
    databaseUrl: () => 'file:./data/frogbot.db',
    upload: ({ key: uploadedKey, path: copy }) => {
      const read = new DatabaseSync(copy);
      const tables = Object.fromEntries(
        ['deals', 'users', 'users_sessions', 'payload_jobs', 'payload_locked_documents'].map(
          (table) => [
            table,
            Number((read.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n),
          ],
        ),
      );

      read.close();
      uploaded.push({ key: uploadedKey, tables });

      return Promise.resolve();
    },
  });

  const call = (body: unknown, authorization = 'Bearer jobs-secret', snapshot = true) =>
    endpoint.handler({
      headers: new Headers(authorization ? { authorization } : {}),
      json: () => Promise.resolve(body),
      frogbot: {
        db: snapshot ? { snapshot: sqliteSnapshot({ url: `file:${path}` }) } : {},
      },
    } as unknown as FrogBotRequest);

  return { dir, path, uploaded, call };
}

describe('POST /api/dojo/export', () => {
  it('AC 2: the copy keeps records and users, drops jobs, locks and sessions, and leaves nothing behind', async () => {
    const app = await liveApp();

    const response = await app.call({ key });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key, bytes: expect.any(Number) });
    expect(app.uploaded).toEqual([
      {
        key,
        tables: {
          deals: 2,
          users: 1,
          users_sessions: 0,
          payload_jobs: 0,
          payload_locked_documents: 0,
        },
      },
    ]);
    expect(await readdir(join(app.dir, 'data'))).toEqual(['frogbot.db']);

    const live = new DatabaseSync(app.path);

    expect(live.prepare('SELECT COUNT(*) AS n FROM payload_jobs').get()).toEqual({ n: 1 });

    live.close();
  });

  it('answers only Dojo, and only for an export key', async () => {
    const app = await liveApp();

    expect((await app.call({ key }, 'Bearer wrong')).status).toBe(401);
    expect((await app.call({ key }, '')).status).toBe(401);

    for (const bad of ['.dojo/import/frogbot.db', '.dojo/export/../x.db', 'media/a.png', 7]) {
      expect((await app.call({ key: bad })).status).toBe(400);
    }

    expect(app.uploaded).toEqual([]);
  });

  it('refuses a database it cannot snapshot as not_sqlite', async () => {
    const app = await liveApp();
    const response = await app.call({ key }, 'Bearer jobs-secret', false);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not_sqlite' });
  });

  it('refuses with disk_full when the copy fails for room, leaving nothing', async () => {
    const app = await liveApp();
    const full = dojoExportEndpoint({
      env,
      collections: [],
      cwd: app.dir,
      databaseUrl: () => 'file:./data/frogbot.db',
      upload: () =>
        Promise.reject(
          Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }),
        ),
    });

    const response = await full.handler({
      headers: new Headers({ authorization: 'Bearer jobs-secret' }),
      json: () => Promise.resolve({ key }),
      frogbot: { db: { snapshot: sqliteSnapshot({ url: `file:${app.path}` }) } },
    } as unknown as FrogBotRequest);

    expect(response.status).toBe(507);
    expect(await response.json()).toEqual({ error: 'disk_full' });
    expect(await readdir(join(app.dir, 'data'))).toEqual(['frogbot.db']);
  });

  it('reads the database path from a file: URL', () => {
    expect(databaseFile('file:/data/frogbot.db', '/app')).toBe('/data/frogbot.db');
    expect(databaseFile('file:./frogbot.db?mode=rw', '/app')).toBe('/app/frogbot.db');
    expect(databaseFile('postgres://x', '/app')).toBeUndefined();
    expect(databaseFile('file::memory:', '/app')).toBeUndefined();
  });
});
