import { existsSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SanitizedCollectionConfig, SanitizedConfig } from 'payload';
import { describe, expect, it, onTestFinished } from 'vitest';

import type { DatabaseSnapshot } from '../../../../packages/frogbot/src/database/types.js';
import {
  type DataInventory,
  describeData,
  takeInventory,
} from '../../../../packages/plugins/plugin-dojo/src/cli/data/inventory.js';
import { tempDir, writeFiles } from './helpers.js';

type TestCollection = Partial<Omit<SanitizedCollectionConfig, 'auth' | 'upload'>> & {
  slug: string;
  upload?: { staticDir?: string; disableLocalStorage?: boolean };
  auth?: boolean;
};

function collection({ slug, ...rest }: TestCollection): SanitizedCollectionConfig {
  return {
    slug,
    admin: {},
    labels: { singular: slug, plural: slug },
    ...rest,
  } as unknown as SanitizedCollectionConfig;
}

function snapshotOf(schema: string) {
  return ({ cwd, to }: { cwd: string; to: string }): Promise<DatabaseSnapshot> => {
    const db = new DatabaseSync(to);

    db.exec(schema);

    return Promise.resolve({
      source: join(cwd, 'frogbot.db'),
      all: (sql) => Promise.resolve(db.prepare(sql).all()),
      run: (sql) => Promise.resolve(db.exec(sql)),
      close: () => Promise.resolve(db.close()),
    });
  };
}

async function inventoryOf(props: Parameters<typeof takeInventory>[0]): Promise<DataInventory> {
  const inventory = await takeInventory(props);

  if (!inventory || inventory === 'unsupported') throw new Error(`No inventory: ${inventory}`);

  onTestFinished(() => inventory.dispose());

  return inventory;
}

function config(
  collections: TestCollection[],
  schema: string,
): Pick<SanitizedConfig, 'collections' | 'db'> {
  return {
    collections: collections.map(collection),
    db: { snapshot: snapshotOf(schema) } as unknown as SanitizedConfig['db'],
  };
}

function rows(table: string, count: number, columns = ''): string {
  return [
    `CREATE TABLE ${table} (id INTEGER PRIMARY KEY${columns});`,
    ...Array.from({ length: count }, () => `INSERT INTO ${table} DEFAULT VALUES;`),
  ].join('\n');
}

function tableRows(path: string, table: string): number {
  const db = new DatabaseSync(path);
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };

  db.close();

  return count;
}

describe('describeData', () => {
  it.each([
    [
      [
        { count: 42, label: 'deals' },
        { count: 3, label: 'users' },
      ],
      12,
      '42 deals, 3 users, 12 files',
    ],
    [[{ count: 1, label: 'deal' }], 1, '1 deal, 1 file'],
    [[{ count: 2, label: 'people' }], 0, '2 people'],
    [[], 3, '3 files'],
    [[], 0, ''],
  ])('%j and %i files read %j', (counts, fileCount, text) => {
    expect(
      describeData({ counts: counts.map((count) => ({ slug: 'x', ...count })), fileCount }),
    ).toBe(text);
  });
});

describe('takeInventory', () => {
  it('is unsupported when the adapter has no snapshot', async () => {
    await expect(
      takeInventory({
        root: await tempDir(),
        config: { collections: [], db: {} as SanitizedConfig['db'] },
      }),
    ).resolves.toBe('unsupported');
  });

  it('brings nothing when there is no database file', async () => {
    let copy = '';

    const result = await takeInventory({
      root: await tempDir(),
      config: {
        collections: [],
        db: {
          snapshot: ({ to }: { to: string }) => {
            copy = to;

            return Promise.resolve(undefined);
          },
        } as unknown as SanitizedConfig['db'],
      },
    });

    expect(result).toBeUndefined();
    expect(existsSync(join(copy, '..'))).toBe(false);
  });

  it('brings nothing when every count is 0, and removes the copy', async () => {
    const result = await takeInventory({
      root: await tempDir(),
      config: config([{ slug: 'deals' }], rows('deals', 0)),
    });

    expect(result).toBeUndefined();
  });

  it.each<[string, TestCollection['labels'], number, string]>([
    ['a string', { singular: 'Deal', plural: 'Deals' }, 2, '2 deals'],
    ['a string, singular for 1', { singular: 'Deal', plural: 'Deals' }, 1, '1 deal'],
    [
      'a locale map',
      { singular: { fr: 'Affaire', en: 'Deal' }, plural: { fr: 'Affaires', en: 'Big Deals' } },
      2,
      '2 big deals',
    ],
    [
      'a locale map without en',
      { singular: { fr: 'Affaire' }, plural: { fr: 'Affaires' } },
      2,
      '2 affaires',
    ],
    ['a function', { singular: () => 'x', plural: () => 'x' }, 2, '2 open deals'],
    ['a function, singular for 1', { singular: () => 'x', plural: () => 'x' }, 1, '1 open deal'],
  ])('labels from %s', async (_, labels, count, text) => {
    const inventory = await inventoryOf({
      root: await tempDir(),
      config: config([{ slug: 'open-deals', labels }], rows('open_deals', count)),
    });

    expect(describeData(inventory)).toBe(text);
  });

  it('counts visible collections, leaves out trashed records, and empties what belongs to the laptop', async () => {
    const root = await tempDir();

    await writeFiles(root, {
      'files/a.png': 'aa',
      'files/a-thumbnail.png': 'a',
      'files/nested/b.pdf': 'bbb',
      'frogbot-chat-assets/c.png': 'cccc',
      'media/stored-elsewhere.png': 'x',
    });

    const inventory = await inventoryOf({
      root,
      config: config(
        [
          { slug: 'deals', trash: true, labels: { singular: 'Deal', plural: 'Deals' } },
          { slug: 'users', auth: true, labels: { singular: 'User', plural: 'Users' } },
          {
            slug: 'training-sessions',
            labels: { singular: 'Training Session', plural: 'Training Sessions' },
          },
          { slug: 'files', upload: {} },
          {
            slug: 'media',
            upload: { disableLocalStorage: true },
            labels: { singular: 'Medium', plural: 'Media' },
          },
          { slug: 'frogbot-chat-assets', upload: {}, admin: { hidden: true } },
          { slug: 'chats', custom: { frogbot: { internal: true } } },
          { slug: 'secret', admin: { hidden: true } },
          { slug: 'payload-preferences' },
          { slug: 'empty' },
          { slug: 'missing-table' },
        ],
        [
          rows('deals', 4, ', deleted_at TEXT'),
          "UPDATE deals SET deleted_at = 'now' WHERE id = 4;",
          rows('users', 3),
          rows('users_sessions', 2),
          rows('training_sessions', 5),
          rows('files', 2),
          rows('media', 1),
          rows('frogbot_chat_assets', 1),
          rows('chats', 7),
          rows('secret', 1),
          rows('payload_preferences', 1),
          rows('empty', 0),
          rows('payload_jobs', 2),
          rows('payload_jobs_log', 2),
          rows('frogbot_waitpoints', 1),
          rows('payload_locked_documents', 1),
          rows('payload_locked_documents_rels', 1),
          rows('payload_kv', 1),
          rows('frogbot_trigger_subscriptions', 1),
          rows('payload_jobsx', 1),
        ].join('\n'),
      ),
    });

    expect(describeData(inventory)).toBe(
      '3 deals, 3 users, 5 training sessions, 1 medium, 2 files',
    );

    const { snapshotPath } = inventory;

    for (const table of [
      'users_sessions',
      'payload_jobs',
      'payload_jobs_log',
      'frogbot_waitpoints',
      'payload_locked_documents',
      'payload_locked_documents_rels',
      'payload_kv',
      'frogbot_trigger_subscriptions',
    ]) {
      expect(tableRows(snapshotPath, table), table).toBe(0);
    }

    expect(tableRows(snapshotPath, 'training_sessions')).toBe(5);
    expect(tableRows(snapshotPath, 'chats')).toBe(7);
    expect(tableRows(snapshotPath, 'payload_jobsx')).toBe(1);

    expect(inventory.files.map(({ key, size }) => [key, size]).sort()).toEqual([
      ['files/a-thumbnail.png', 1],
      ['files/a.png', 2],
      ['files/nested/b.pdf', 3],
      ['frogbot-chat-assets/c.png', 4],
    ]);
    expect(inventory.files.find(({ key }) => key === 'files/a.png')?.path).toBe(
      join(root, 'files', 'a.png'),
    );

    await inventory.dispose();

    expect(existsSync(snapshotPath)).toBe(false);
  });

  it('reads upload folders from staticDir, relative to the app root or absolute inside it', async () => {
    const root = await tempDir();
    const elsewhere = await tempDir();

    await writeFiles(root, { 'uploads/docs/a.txt': 'a', 'scans/b.txt': 'b' });
    await writeFiles(elsewhere, { 'c.txt': 'c' });

    const inventory = await inventoryOf({
      root,
      config: config(
        [
          { slug: 'docs', upload: { staticDir: 'uploads/docs' } },
          { slug: 'scans', upload: { staticDir: join(root, 'scans') } },
          { slug: 'outside', upload: { staticDir: elsewhere } },
          { slug: 'gone', upload: { staticDir: 'not-there' } },
        ],
        [rows('docs', 1), rows('scans', 1), rows('outside', 1), rows('gone', 1)].join('\n'),
      ),
    });

    expect(inventory.files.map(({ key }) => key).sort()).toEqual(['docs/a.txt', 'scans/b.txt']);
    expect(inventory.leftFolders).toEqual([`outside (${elsewhere})`]);
    expect(inventory.totalBytes).toBeGreaterThan(2);
  });

  it.each(['.', './', 'files/..', '..', 'linked'])(
    'leaves out an upload folder that is the app root or holds it: %s',
    async (staticDir) => {
      const parent = await tempDir();
      const root = join(parent, 'app');

      await writeFiles(parent, { 'sibling/secret.txt': 'x' });

      await writeFiles(root, {
        '.env': 'FROGBOT_SECRET=s',
        'frogbot.db': 'raw',
        '.frogbot/app.json': '{}',
        'files/a.png': 'a',
      });

      await symlink(root, join(root, 'linked'));

      const inventory = await inventoryOf({
        root,
        config: config([{ slug: 'files', upload: { staticDir } }], rows('files', 1)),
      });

      expect(inventory.files).toEqual([]);
      expect(inventory.leftFolders).toEqual([`files (${staticDir})`]);
    },
  );

  it('follows a linked upload folder that stays inside the app, and skips links inside it', async () => {
    const root = await tempDir();
    const outside = await tempDir();

    await writeFiles(root, { 'store/a.png': 'a' });
    await writeFiles(outside, { 'secret.txt': 'x' });
    await symlink(join(root, 'store'), join(root, 'files'));
    await symlink(outside, join(root, 'store', 'folder-link'));
    await symlink(join(outside, 'secret.txt'), join(root, 'store', 'file-link'));

    const inventory = await inventoryOf({
      root,
      config: config([{ slug: 'files', upload: {} }], rows('files', 1)),
    });

    expect(inventory.files.map(({ key, path }) => [key, path])).toEqual([
      ['files/a.png', join(root, 'store', 'a.png')],
    ]);
  });

  it('never brings laptop-only files, the database or staged uploads from an upload folder', async () => {
    const root = await tempDir();

    await writeFiles(root, {
      'data/a.png': 'a',
      'data/app.db': 'raw',
      'data/app.db-wal': 'w',
      'data/app.db-shm': 's',
      'data/app.db-journal': 'j',
      'data/.env': 'S=1',
      'data/.env.local': 'S=1',
      'data/.git/HEAD': 'h',
      'data/node_modules/x/index.js': 'x',
      'data/frogbot.db-wal': 'w',
      'data/old.sqlite': 'q',
      'data/.payload-staged-uploads/part': 'p',
      'data/nested/.payload-staged-uploads/part': 'p',
      'data/nested/b.png': 'b',
    });

    const snapshot = snapshotOf(rows('media', 1));

    const inventory = await inventoryOf({
      root,
      config: {
        ...config([{ slug: 'media', upload: { staticDir: 'data' } }], ''),
        db: {
          snapshot: async (args: { cwd: string; to: string }) => ({
            ...(await snapshot(args)),
            source: join(root, 'data', 'app.db'),
          }),
        } as unknown as SanitizedConfig['db'],
      },
    });

    expect(inventory.files.map(({ key }) => key).sort()).toEqual([
      'media/a.png',
      'media/nested/b.png',
    ]);
  });

  it('leaves out, and names, files whose names Dojo refuses', async () => {
    const root = await tempDir();

    await writeFiles(root, {
      'files/ok.png': 'a',
      'files/back\\slash.png': 'b',
      'files/bell\u0007.png': 'c',
    });

    const inventory = await inventoryOf({
      root,
      config: config([{ slug: 'files', upload: {} }], rows('files', 3)),
    });

    expect(inventory.files.map(({ key }) => key)).toEqual(['files/ok.png']);
    expect(inventory.leftNames.sort()).toEqual(['files/back\\slash.png', 'files/bell\u0007.png']);
  });
});
