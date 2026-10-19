import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { Ignore } from 'ignore';
import ignore from 'ignore';

const execFileAsync = promisify(execFile);

const neverShipped = ignore().add([
  '.git',
  '.frogbot',
  '.env*',
  'frogbot.db*',
  '*.sqlite*',
  'node_modules',
  '.next',
  '/files',
]);

/** A collection as Payload sanitizes it; only upload collections have `upload` set. */
export type ShareCollection = {
  slug: string;
  upload?: false | { staticDir?: string; disableLocalStorage?: boolean };
};

export type ShareFilesProps = {
  root: string;
  collections: ShareCollection[];
  databaseUrl?: string;
  /** The CLI's login file, never shipped even when it sits inside the app. */
  authFile?: string;
};

export type ShareFileList = {
  /** Regular files to ship. */
  files: string[];
  /** Symlinks, and files reached through one, left out: Dojo refuses links and nothing outside the app ships. */
  symlinks: string[];
};

/** The app's working files to ship, relative to `root` with `/` separators. */
export async function shareFiles({
  root,
  collections,
  databaseUrl,
  authFile,
}: ShareFilesProps): Promise<ShareFileList> {
  const candidates = (await gitFiles(root)) ?? (await walk(root));

  const folders = collections.flatMap((collection) =>
    collection.upload && !collection.upload.disableLocalStorage
      ? (inside(root, resolve(root, collection.upload.staticDir || collection.slug)) ?? [])
      : [],
  );

  const database = databasePath(root, databaseUrl);

  const kept = candidates.filter(
    (path) =>
      !neverShipped.ignores(path) &&
      !folders.some((folder) => path === folder || path.startsWith(`${folder}/`)) &&
      !(database && (path === database || path.startsWith(`${database}-`))),
  );

  const realRoot = await realpath(root);
  const login = authFile && (await realpath(authFile).catch(() => undefined));
  const kinds = await Promise.all(kept.map((path) => kind(realRoot, path, login)));

  return {
    files: kept.filter((_, index) => kinds[index] === 'file'),
    symlinks: kept.filter((_, index) => kinds[index] === 'symlink'),
  };
}

async function kind(
  realRoot: string,
  path: string,
  login: string | undefined,
): Promise<'file' | 'symlink' | undefined> {
  const full = join(realRoot, path);
  const stats = await lstat(full).catch(() => undefined);

  if (stats?.isSymbolicLink()) return 'symlink';
  if (!stats?.isFile()) return undefined;

  const real = await realpath(full).catch(() => undefined);

  if (real !== full) return 'symlink';

  return real === login ? undefined : 'file';
}

async function gitFiles(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, maxBuffer: 256 * 1024 * 1024 },
    );

    return [...new Set(stdout.split('\0').filter(Boolean))];
  } catch {
    return undefined;
  }
}

type GitignoreRules = { base: string; rules: Ignore };

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];

  const visit = async (dir: string, outer: GitignoreRules[]) => {
    const gitignore = await readFile(join(root, dir, '.gitignore'), 'utf8').catch(() => undefined);
    const scoped =
      gitignore === undefined ? outer : [...outer, { base: dir, rules: ignore().add(gitignore) }];

    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      const isDir = entry.isDirectory();

      if (neverShipped.ignores(isDir ? `${path}/` : path) || ignoredBy(scoped, path, isDir)) {
        continue;
      }

      if (isDir) await visit(path, scoped);
      else files.push(path);
    }
  };

  await visit('', []);

  return files;
}

function ignoredBy(scoped: GitignoreRules[], path: string, isDir: boolean): boolean {
  for (const { base, rules } of [...scoped].reverse()) {
    const local = base ? path.slice(base.length + 1) : path;
    const { ignored, unignored } = rules.test(isDir ? `${local}/` : local);

    if (ignored || unignored) return ignored;
  }

  return false;
}

function databasePath(root: string, url: string | undefined): string | undefined {
  if (!url?.startsWith('file:')) return undefined;

  const [location = ''] = url.split('?');

  try {
    const path = location.startsWith('file://') ? fileURLToPath(location) : location.slice(5);

    return inside(root, resolve(root, path));
  } catch {
    return undefined;
  }
}

function inside(root: string, path: string): string | undefined {
  const rel = relative(root, path);

  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;

  return rel.split(sep).join('/');
}
