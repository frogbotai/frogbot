import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../packages/db-sqlite/src/index';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));
vi.mock('frogbot/search', () => import('../../../packages/frogbot/src/exports/search.js'));

describe('sqliteAdapter snapshot', () => {
  let dir: string;
  let app: DatabaseSync | undefined;

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'frogbot-snapshot-test-')));
  });

  afterEach(async () => {
    if (app?.isTransaction) app.exec('ROLLBACK');

    app?.close();
    app = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it.each([':memory:', 'file::memory:', 'file:shared?mode=memory', 'libsql://app.turso.io'])(
    'is unset for %s',
    (url) => {
      expect(sqliteAdapter({ client: { url } }).snapshot).toBeUndefined();
    },
  );

  it('returns undefined and creates nothing when the database file is missing', async () => {
    const { snapshot } = sqliteAdapter({ client: { url: 'file:./frogbot.db' } });

    await expect(snapshot!({ cwd: dir, to: join(dir, 'copy.db') })).resolves.toBeUndefined();
    expect(await readdir(dir)).toEqual([]);
  });

  it('names the source file and never syncs an embedded replica', async () => {
    app = new DatabaseSync(join(dir, 'frogbot.db'));
    app.exec("CREATE TABLE deals (title TEXT); INSERT INTO deals VALUES ('local');");

    const { snapshot } = sqliteAdapter({
      client: { url: 'file:frogbot.db', syncUrl: 'http://127.0.0.1:9', syncInterval: 1 },
    });

    const copy = await snapshot!({ cwd: dir, to: join(dir, 'copy.db') });

    expect(copy!.source).toBe(join(dir, 'frogbot.db'));
    expect(await copy!.all('SELECT title FROM deals')).toEqual([{ title: 'local' }]);

    await copy!.close();
  });

  it('copies without waiting for an open write and leaves the uncommitted row out', async () => {
    app = new DatabaseSync(join(dir, 'frogbot.db'));

    app.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE deals (title TEXT);
      INSERT INTO deals VALUES ('committed');
      BEGIN IMMEDIATE;
      INSERT INTO deals VALUES ('uncommitted');
    `);

    const { snapshot } = sqliteAdapter({ client: { url: 'file:frogbot.db' } });
    const started = Date.now();
    const copy = await snapshot!({ cwd: dir, to: join(dir, 'copy.db') });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(await copy!.all('SELECT title FROM deals')).toEqual([{ title: 'committed' }]);

    await copy!.run("INSERT INTO deals VALUES ('in the copy')");

    expect(await copy!.all('SELECT COUNT(*) AS count FROM deals')).toEqual([{ count: 2 }]);

    await copy!.close();
    app.exec('ROLLBACK');

    expect(app.prepare('SELECT title FROM deals').all()).toEqual([{ title: 'committed' }]);
  });
});
