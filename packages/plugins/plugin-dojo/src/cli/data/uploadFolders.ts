import { isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { isSafeEntry } from './unzip.js';

/**
 * Where each upload collection keeps its files, by slug, written into an exported database so a
 * pull can put `<slug>/…` entries back in the collection's `staticDir`; the pull drops it.
 */
export const uploadFoldersTable = 'frogbot_dojo_uploads';

type UploadCollection = { slug: string; upload?: unknown };

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** The statements that record each upload collection's folder inside `cwd`, relative to it. */
export function uploadFoldersSql(collections: UploadCollection[], cwd: string): string[] {
  const rows = collections.flatMap(({ slug, upload }) => {
    if (!upload || typeof upload !== 'object') return [];

    const staticDir = (upload as { staticDir?: unknown }).staticDir;
    const folder = relative(
      cwd,
      resolve(cwd, typeof staticDir === 'string' && staticDir ? staticDir : slug),
    );

    if (!folder || folder === '..' || folder.startsWith(`..${sep}`) || isAbsolute(folder)) {
      return [];
    }

    return [`(${literal(slug)}, ${literal(folder.split(sep).join('/'))})`];
  });

  return [
    `CREATE TABLE ${uploadFoldersTable} (slug TEXT PRIMARY KEY, static_dir TEXT NOT NULL)`,
    ...(rows.length > 0 ? [`INSERT INTO ${uploadFoldersTable} VALUES ${rows.join(', ')}`] : []),
  ];
}

/**
 * Reads and drops the upload folders an export recorded in the database at `path`. A database
 * without them, or that isn't SQLite, has none.
 */
export function takeUploadFolders(path: string): Map<string, string> {
  let db: DatabaseSync | undefined;

  try {
    db = new DatabaseSync(path);

    const rows = db.prepare(`SELECT slug, static_dir FROM ${uploadFoldersTable}`).all();

    db.exec(`DROP TABLE ${uploadFoldersTable}`);

    return new Map(
      rows.flatMap(({ slug, static_dir: folder }) =>
        typeof slug === 'string' && typeof folder === 'string' && isSafeEntry(folder)
          ? [[slug, folder] as const]
          : [],
      ),
    );
  } catch {
    return new Map();
  } finally {
    db?.close();
  }
}
