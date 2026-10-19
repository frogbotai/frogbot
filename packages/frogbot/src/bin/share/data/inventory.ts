import type { Dirent } from 'node:fs';
import { mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import ignore from 'ignore';
import type { SanitizedCollectionConfig, SanitizedConfig } from 'payload';
import { formatLabels } from 'payload/shared';
import toSnakeCase from 'to-snake-case';

import { isInternalCollection } from '../../../collections/config/internal.js';
import type { DatabaseAdapter, DatabaseSnapshot } from '../../../database/types.js';
import { neverShared } from '../files.js';

const laptopTables = [
  'payload_jobs',
  'frogbot_waitpoints',
  'payload_locked_documents',
  'payload_kv',
  'frogbot_trigger_subscriptions',
];

const neverBrought = ignore().add(neverShared).add('.payload-staged-uploads');

export type DataCount = {
  slug: string;
  count: number;
  /** Lowercase, singular for 1. */
  label: string;
};

export type DataFile = {
  /** `<collection slug>/<path inside its upload folder>`, the object key on Dojo. */
  key: string;
  path: string;
  size: number;
};

export type DataInventory = {
  /** The cleaned copy of the database, in a temp folder of its own. */
  snapshotPath: string;
  /** Visible collections with records, in config order; local upload collections are `fileCount`. */
  counts: DataCount[];
  fileCount: number;
  files: DataFile[];
  /** Upload folders left out, as `<slug> (<staticDir>)`: the app root, one of its parents, or outside it. */
  leftFolders: string[];
  /** Keys left out because Dojo refuses their names. */
  leftNames: string[];
  totalBytes: number;
  /** Removes the temp folder. */
  dispose: () => Promise<void>;
};

export type TakeInventoryProps = {
  root: string;
  config: Pick<SanitizedConfig, 'collections' | 'db'>;
};

/**
 * What a first share can bring: `'unsupported'` when the database adapter can't snapshot (not
 * SQLite on a file), `undefined` when there is no database or nothing to count. Reads only a
 * snapshot of the database, never the app's own file.
 */
export async function takeInventory({
  root,
  config,
}: TakeInventoryProps): Promise<DataInventory | 'unsupported' | undefined> {
  const { snapshot } = config.db as Pick<DatabaseAdapter, 'snapshot'>;

  if (!snapshot) return 'unsupported';

  const folder = await mkdtemp(join(tmpdir(), 'frogbot-share-'));
  const dispose = () => rm(folder, { recursive: true, force: true });

  try {
    const snapshotPath = join(folder, 'frogbot.db');
    const db = await snapshot({ cwd: root, to: snapshotPath });

    if (!db) {
      await dispose();

      return undefined;
    }

    const { source } = db;
    let records: { collection: SanitizedCollectionConfig; count: number }[];

    try {
      records = await countRecords(db, config.collections);
      await clean(db, config.collections);
    } finally {
      await db.close();
    }

    const counts = records
      .filter(({ collection, count }) => count > 0 && !storesFiles(collection))
      .map(({ collection, count }) => ({
        slug: collection.slug,
        count,
        label: collectionLabel(collection, count),
      }));

    const fileCount = records
      .filter(({ collection }) => storesFiles(collection))
      .reduce((sum, { count }) => sum + count, 0);

    if (counts.length === 0 && fileCount === 0) {
      await dispose();

      return undefined;
    }

    const { files, leftFolders, leftNames } = await uploadedFiles(root, config.collections, source);
    const totalBytes =
      (await stat(snapshotPath)).size + files.reduce((sum, file) => sum + file.size, 0);

    return {
      snapshotPath,
      counts,
      fileCount,
      files,
      leftFolders,
      leftNames,
      totalBytes,
      dispose,
    };
  } catch (error) {
    await dispose();

    throw error;
  }
}

/** `42 deals, 3 users, 12 files`. */
export function describeData({ counts, fileCount }: Pick<DataInventory, 'counts' | 'fileCount'>) {
  return [
    ...counts.map(({ count, label }) => `${count} ${label}`),
    ...(fileCount > 0 ? [`${fileCount} ${fileCount === 1 ? 'file' : 'files'}`] : []),
  ].join(', ');
}

async function countRecords(db: DatabaseSnapshot, collections: SanitizedCollectionConfig[]) {
  const tables = await tableNames(db);

  const records = [];

  for (const collection of collections.filter(isCounted)) {
    const table = tableName(collection);

    if (!tables.has(table)) continue;

    const [row] = await db.all(
      `SELECT COUNT(*) AS count FROM ${quote(table)}${collection.trash ? ' WHERE deleted_at IS NULL' : ''}`,
    );

    records.push({ collection, count: Number(row?.count ?? 0) });
  }

  return records;
}

async function clean(db: DatabaseSnapshot, collections: SanitizedCollectionConfig[]) {
  const emptied = [
    ...laptopTables,
    ...collections.filter((collection) => collection.auth).map((c) => `${tableName(c)}_sessions`),
  ];

  await db.run('PRAGMA foreign_keys = OFF');

  for (const table of await tableNames(db)) {
    if (emptied.some((name) => table === name || table.startsWith(`${name}_`))) {
      await db.run(`DELETE FROM ${quote(table)}`);
    }
  }

  await db.run('VACUUM');
}

async function tableNames(db: DatabaseSnapshot): Promise<Set<string>> {
  const rows = await db.all("SELECT name FROM sqlite_master WHERE type = 'table'");

  return new Set(rows.map((row) => String(row.name)));
}

type UploadedFiles = Pick<DataInventory, 'files' | 'leftFolders' | 'leftNames'>;

async function uploadedFiles(
  root: string,
  collections: SanitizedCollectionConfig[],
  database: string,
): Promise<UploadedFiles> {
  const realRoot = await realpath(root);
  const realDatabase = await realpath(database).catch(() => database);
  const found: UploadedFiles = { files: [], leftFolders: [], leftNames: [] };

  for (const collection of collections.filter(storesFiles)) {
    const staticDir = collection.upload.staticDir || collection.slug;
    const folder = await realpath(resolve(root, staticDir)).catch(() => undefined);

    if (!folder) continue;

    if (!isInside(realRoot, folder)) {
      found.leftFolders.push(`${collection.slug} (${staticDir})`);
      continue;
    }

    for (const path of await filesIn(folder)) {
      const inApp = relative(realRoot, path).split(sep).join('/');

      if (
        neverBrought.ignores(inApp) ||
        path === realDatabase ||
        path.startsWith(`${realDatabase}-`)
      ) {
        continue;
      }

      const key = `${collection.slug}/${relative(folder, path).split(sep).join('/')}`;

      if (refusedByDojo(key)) found.leftNames.push(key);
      else found.files.push({ key, path, size: (await stat(path)).size });
    }
  }

  return found;
}

function isInside(root: string, folder: string): boolean {
  const path = relative(root, folder);

  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function refusedByDojo(key: string): boolean {
  // eslint-disable-next-line no-control-regex -- Dojo refuses control characters in keys
  return /[\\\u0000-\u001f]/.test(key) || Buffer.byteLength(key) > 1024;
}

async function filesIn(folder: string): Promise<string[]> {
  let entries: Dirent[];

  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const path = join(folder, entry.name);

    if (entry.isDirectory()) files.push(...(await filesIn(path)));
    else if (entry.isFile()) files.push(path);
  }

  return files;
}

function isCounted(collection: SanitizedCollectionConfig): boolean {
  return (
    collection.admin?.hidden !== true &&
    !collection.slug.startsWith('payload-') &&
    !isInternalCollection(collection)
  );
}

function storesFiles(
  collection: SanitizedCollectionConfig,
): collection is SanitizedCollectionConfig & {
  upload: Exclude<SanitizedCollectionConfig['upload'], false | undefined>;
} {
  return Boolean(collection.upload) && !collection.upload.disableLocalStorage;
}

function tableName(collection: SanitizedCollectionConfig): string {
  const { dbName } = collection;

  return (typeof dbName === 'function' ? dbName({}) : dbName) || toSnakeCase(collection.slug);
}

function collectionLabel(collection: SanitizedCollectionConfig, count: number): string {
  const key = count === 1 ? 'singular' : 'plural';
  const label = collection.labels?.[key];
  const text =
    typeof label === 'string'
      ? label
      : label && typeof label === 'object'
        ? (label.en ?? Object.values(label)[0])
        : undefined;

  return (text || formatLabels(collection.slug)[key]).toLowerCase();
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
