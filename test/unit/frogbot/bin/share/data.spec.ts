import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SanitizedCollectionConfig } from 'payload';
import { describe, expect, it } from 'vitest';

import { writeToken } from '../../../../../packages/frogbot/src/bin/share/auth.js';
import { snapshotKey } from '../../../../../packages/frogbot/src/bin/share/data/upload.js';
import type { ShareConfig } from '../../../../../packages/frogbot/src/bin/share/io.js';
import { runShare } from '../../../../../packages/frogbot/src/bin/share/run.js';
import type { DatabaseSnapshot } from '../../../../../packages/frogbot/src/database/types.js';
import { startFakeDojo } from './fakeDojo.js';
import { tempDir, testIO, writeApp } from './helpers.js';

const summary = '42 deals, 3 users, 12 files';

const inserts = (table: string, count: number, values = 'DEFAULT VALUES') =>
  Array.from({ length: count }, () => `INSERT INTO ${table} ${values};`).join('\n');

const schema = [
  'CREATE TABLE deals (id INTEGER PRIMARY KEY, deleted_at TEXT);',
  inserts('deals', 42),
  "INSERT INTO deals (deleted_at) VALUES ('2026-10-01');",
  'CREATE TABLE users (id INTEGER PRIMARY KEY);',
  inserts('users', 3),
  'CREATE TABLE users_sessions (id INTEGER PRIMARY KEY);',
  inserts('users_sessions', 2),
  'CREATE TABLE files (id INTEGER PRIMARY KEY);',
  inserts('files', 12),
  'CREATE TABLE payload_jobs (id INTEGER PRIMARY KEY);',
  inserts('payload_jobs', 1),
].join('\n');

const collections = [
  { slug: 'deals', trash: true, labels: { singular: 'Deal', plural: 'Deals' } },
  { slug: 'users', auth: {}, labels: { singular: 'User', plural: 'Users' } },
  { slug: 'files', upload: { staticDir: 'files' }, labels: { singular: 'File', plural: 'Files' } },
].map((collection) => ({ admin: {}, ...collection }) as unknown as SanitizedCollectionConfig);

const uploads = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [`files/scan-${index + 1}.png`, `png ${index + 1}`]),
);

function sqliteApp() {
  const copies: string[] = [];
  const local = { addedDeals: 0 };

  const snapshot = ({ cwd, to }: { cwd: string; to: string }): Promise<DatabaseSnapshot> => {
    const db = new DatabaseSync(to);

    copies.push(to);
    db.exec(schema);
    db.exec(inserts('deals', local.addedDeals));

    return Promise.resolve({
      source: join(cwd, 'frogbot.db'),
      all: (sql) => Promise.resolve(db.prepare(sql).all()),
      run: (sql) => Promise.resolve(db.exec(sql)),
      close: () => Promise.resolve(db.close()),
    });
  };

  const config = { collections, db: { snapshot } } as unknown as ShareConfig;

  return { config, copies, local };
}

async function setup({
  config = sqliteApp().config,
  dotenv = 'FROGBOT_SECRET=local-secret-0123456789\nSTRIPE_KEY=sk_test_4242424242\n',
  files = uploads,
}: { config?: ShareConfig; dotenv?: string; files?: Record<string, string> } = {}) {
  const root = await tempDir();
  const dojo = await startFakeDojo();
  const env = { XDG_CONFIG_HOME: await tempDir(), FROGBOT_DOJO_URL: dojo.url };

  await writeApp(root, {
    '.env': dotenv,
    ...files,
  });

  dojo.tokens.set('fb_stored', 100);
  await writeToken(env, dojo.url, 'fb_stored');

  const run = async (
    args: string[],
    options: Omit<Parameters<typeof testIO>[0], 'cwd' | 'env'> = {},
  ) => {
    const io = testIO({ cwd: root, env, config, ...options });

    return { code: await runShare(args, io.io), ...io };
  };

  const dataRequests = () =>
    dojo.requests.filter(
      (request) => request.path.includes('/data-uploads') || request.path.startsWith('/bucket/'),
    );

  const uploadedDeals = async () => {
    const path = join(root, 'uploaded.db');

    await writeFile(path, dojo.data.bucket.get(snapshotKey) ?? Buffer.alloc(0));

    const db = new DatabaseSync(path);
    const { count } = db
      .prepare('SELECT COUNT(*) AS count FROM deals WHERE deleted_at IS NULL')
      .get() as { count: number };

    db.close();

    return count;
  };

  return { root, dojo, run, dataRequests, uploadedDeals };
}

describe('frogbot share: bringing data', () => {
  it('asks in a terminal with the counts, trash left out and the upload collection as files, and brings the data on Yes', async () => {
    const { dojo, run } = await setup();
    const result = await run([], { isTTY: true, confirm: true, multiselect: ['STRIPE_KEY'] });

    expect(result.code).toBe(0);
    expect(result.asked[0]).toBe(`Bring your data? ${summary}`);
    expect(dojo.data.bucket.has(snapshotKey)).toBe(true);
  });

  it('stops a first share with no terminal and no flag, before any request', async () => {
    const { dojo, run } = await setup();
    const result = await run([]);

    expect(result.code).toBe(1);
    expect(result.stderr()).toEqual([
      `[frogbot] This first share can bring the local data (${summary}). Ask the person whether to bring it, then rerun with --data or --no-data.`,
    ]);
    expect(dojo.requests).toEqual([]);
  });

  it('with --data, sends the snapshot and files before the deployment, with FROGBOT_SECRET sealed but not shown', async () => {
    const app = sqliteApp();
    const { dojo, run } = await setup({ config: app.config });
    const result = await run(['--data']);

    expect(result.code).toBe(0);
    expect([...dojo.data.bucket.keys()].sort()).toEqual(
      [snapshotKey, ...Object.keys(uploads)].sort(),
    );
    expect(dojo.data.bucket.get('files/scan-1.png')?.toString()).toBe('png 1');

    const paths = dojo.paths();

    expect(paths.indexOf('POST /api/apps/1/data-uploads')).toBeLessThan(
      paths.indexOf('POST /api/apps/1/deployments'),
    );
    expect(dojo.opened).toEqual([
      {
        values: { STRIPE_KEY: 'sk_test_4242424242', FROGBOT_SECRET: 'local-secret-0123456789' },
        updateKeys: false,
      },
    ]);
    expect(result.stdout()).toContain('[frogbot] Bringing 1 key: STRIPE_KEY ••••4242');
    expect(result.stdout()).toContainEqual(
      expect.stringMatching(
        new RegExp(`^\\[frogbot\\] Bringing data: ${summary} \\(\\d+\\.\\d KB\\)$`),
      ),
    );
    expect(result.stdout().join('\n')).not.toContain('FROGBOT_SECRET');
    expect(app.copies).toHaveLength(1);
    expect(existsSync(app.copies[0] ?? '')).toBe(false);
  });

  it('uploads the cleaned snapshot', async () => {
    const { dojo, root, run } = await setup();

    expect((await run(['--data'])).code).toBe(0);

    const path = join(root, 'uploaded.db');

    await writeFile(path, dojo.data.bucket.get(snapshotKey) ?? Buffer.alloc(0));

    const db = new DatabaseSync(path);
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;

    expect([
      count('deals'),
      count('users'),
      count('users_sessions'),
      count('payload_jobs'),
    ]).toEqual([43, 3, 0, 0]);

    db.close();
  });

  it('with --no-data, takes no snapshot and sends neither the data nor FROGBOT_SECRET', async () => {
    const app = sqliteApp();
    const { dojo, run, dataRequests } = await setup({ config: app.config });
    const result = await run(['--no-data']);

    expect(result.code).toBe(0);
    expect(app.copies).toEqual([]);
    expect(dataRequests()).toEqual([]);
    expect(dojo.opened).toEqual([
      { values: { STRIPE_KEY: 'sk_test_4242424242' }, updateKeys: false },
    ]);
  });

  it('on No in a terminal, removes the snapshot and sends no data', async () => {
    const app = sqliteApp();
    const { dojo, run, dataRequests } = await setup({ config: app.config });
    const result = await run([], { isTTY: true, confirm: false, multiselect: ['STRIPE_KEY'] });

    expect(result.code).toBe(0);
    expect(dataRequests()).toEqual([]);
    expect(existsSync(app.copies[0] ?? '')).toBe(false);
    expect(Object.keys(dojo.opened[0]?.values ?? {})).toEqual(['STRIPE_KEY']);
  });

  it('never asks or snapshots once the app has started, and says so for --data', async () => {
    const app = sqliteApp();
    const { run, dataRequests } = await setup({ config: app.config });

    expect((await run(['--no-data'])).code).toBe(0);

    const later = await run([], { isTTY: true });

    expect(later.code).toBe(0);
    expect(later.asked).toEqual([]);

    const flagged = await run(['--data']);

    expect(flagged.code).toBe(0);
    expect(flagged.stdout()[0]).toBe(
      '[frogbot] Data comes only with the first share; sharing code only.',
    );
    expect(app.copies).toEqual([]);
    expect(dataRequests()).toEqual([]);
  });

  it('stops before any deployment when the data upload fails, and asks again on the rerun', async () => {
    const { dojo, run } = await setup();

    dojo.forbidden.add(1);

    const failed = await run(['--data']);

    expect(failed.code).toBe(1);
    expect(failed.stderr()).toEqual([
      "[frogbot] Couldn't start the data upload: Only the app’s owners can publish it.",
    ]);
    expect(dojo.paths()).not.toContain('POST /api/apps/1/deployments');

    dojo.forbidden.delete(1);

    const piped = await run([]);

    expect(piped.code).toBe(1);
    expect(piped.stderr()[0]).toContain(`can bring the local data (${summary})`);

    const rerun = await run(['--data']);

    expect(rerun.code).toBe(0);
    expect(dojo.paths().filter((path) => path === 'POST /api/apps/1/deployments')).toHaveLength(1);
    expect(dojo.data.bucket.has(snapshotKey)).toBe(true);
    expect(dojo.opened.at(-1)?.values.FROGBOT_SECRET).toBe('local-secret-0123456789');
  });

  it('shares code only, with one line, when the database adapter cannot snapshot', async () => {
    const { run, dataRequests } = await setup({
      config: { collections, db: {} } as unknown as ShareConfig,
    });

    const result = await run([]);

    expect(result.code).toBe(0);
    expect(result.stdout()[0]).toBe(
      '[frogbot] Your data stays on this computer: bringing data works only for SQLite apps for now.',
    );
    expect(dataRequests()).toEqual([]);
  });

  it('neither asks nor stops when there is nothing to count', async () => {
    const empty = {
      collections,
      db: { snapshot: () => Promise.resolve(undefined) },
    } as unknown as ShareConfig;

    const { run, dataRequests } = await setup({ config: empty });

    const result = await run([]);

    expect(result.code).toBe(0);
    expect(result.asked).toEqual([]);
    expect(dataRequests()).toEqual([]);
  });

  it('tells Dojo on the first share whether data came, and nothing once the app has started', async () => {
    const brought = await setup();

    expect((await brought.run(['--data'])).code).toBe(0);
    expect((await brought.run([])).code).toBe(0);
    expect(brought.dojo.data.sent).toEqual(['true', undefined]);

    const declined = await setup();

    expect((await declined.run(['--no-data'])).code).toBe(0);
    expect(declined.dojo.data.sent).toEqual(['false']);
  });

  it('sends a fresh snapshot on a rerun, even at the same size', async () => {
    const app = sqliteApp();
    const { dojo, run, uploadedDeals } = await setup({ config: app.config });

    dojo.build.status = 'failed';

    expect((await run(['--data'])).code).toBe(1);
    expect(await uploadedDeals()).toBe(42);

    const firstSize = dojo.data.bucket.get(snapshotKey)?.length;

    app.local.addedDeals = 1;
    dojo.build.status = 'ready';

    expect((await run(['--data'])).code).toBe(0);
    expect(dojo.data.bucket.get(snapshotKey)?.length).toBe(firstSize);
    expect(await uploadedDeals()).toBe(43);
  });

  it('drops an earlier attempt’s snapshot when a rerun says No', async () => {
    const { dojo, run } = await setup();

    dojo.build.status = 'failed';

    expect((await run(['--data'])).code).toBe(1);
    expect(dojo.data.bucket.has(snapshotKey)).toBe(true);

    dojo.build.status = 'ready';

    expect((await run(['--no-data'])).code).toBe(0);
    expect(dojo.data.sent).toEqual(['true', 'false']);
    expect(dojo.data.bucket.has(snapshotKey)).toBe(false);
    expect(dojo.opened).toHaveLength(1);
  });

  it('warns once when data comes without a local FROGBOT_SECRET', async () => {
    const { dojo, run } = await setup({ dotenv: 'STRIPE_KEY=sk_test_4242424242\n' });
    const result = await run(['--data']);

    expect(result.code).toBe(0);
    expect(
      result.stdout().filter((line) => line.includes("There's no local FROGBOT_SECRET")),
    ).toEqual([
      "[frogbot] There's no local FROGBOT_SECRET, so connections stored in the data won't open on Dojo.",
    ]);
    expect(dojo.opened[0]?.values).toEqual({ STRIPE_KEY: 'sk_test_4242424242' });
  });

  it('names the files Dojo would refuse and brings the rest', async () => {
    const { dojo, run } = await setup({
      files: { ...uploads, 'files/back\\slash.png': 'b', 'files/bell\u001b.png': 'c' },
    });

    const result = await run(['--data']);

    expect(result.code).toBe(0);
    expect(result.stdout()).toContain(
      "[frogbot] Left out 2 files whose names Dojo can't store: files/back\\slash.png, files/bell\\u001b.png",
    );
    expect([...dojo.data.bucket.keys()].sort()).toEqual(
      [snapshotKey, ...Object.keys(uploads)].sort(),
    );
  });

  it('refuses --data with --no-data', async () => {
    const { dojo, run } = await setup();
    const result = await run(['--data', '--no-data']);

    expect(result.code).toBe(2);
    expect(result.stderr()[0]).toContain('Use --data or --no-data, not both.');
    expect(dojo.requests).toEqual([]);
  });
});
