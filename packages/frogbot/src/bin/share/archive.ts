import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Pack } from 'tar';

import { ShareError } from './error.js';

/** Dojo's limit on the source archive, in bytes. */
export const sourceLimit = 100_000_000;

/** Dojo's limit on the number of entries in the source archive. */
export const entryLimit = 100_000;

export type ShareArchive = {
  path: string;
  bytes: number;
  summary: string;
  remove: () => Promise<void>;
};

/** Packs `files` from `root` into a temporary `.tar.gz`, stopping before any upload when Dojo would refuse it. Each path is packed as itself: `tar.create` would read one starting with `@` as another archive to copy in. */
export async function createArchive({
  root,
  files,
  limit = sourceLimit,
}: {
  root: string;
  files: string[];
  limit?: number;
}): Promise<ShareArchive> {
  if (files.length > entryLimit) {
    throw new ShareError(
      `The source has more than ${entryLimit.toLocaleString('en-US')} files and folders. Check .gitignore for large folders.`,
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'frogbot-share-'));
  const remove = () => rm(dir, { recursive: true, force: true });
  const path = join(dir, 'source.tar.gz');

  await pack({ root, files, path }).catch(async (error: unknown) => {
    await remove();

    throw error;
  });

  const { size: bytes } = await stat(path);

  if (bytes > limit) {
    await remove();

    throw new ShareError(
      `Source is ${Math.ceil(bytes / 1_000_000)} MB; the limit is ${limit / 1_000_000} MB. Check .gitignore for large folders.`,
    );
  }

  const summary = `Uploading ${files.length} ${files.length === 1 ? 'file' : 'files'} (${formatSize(bytes)})`;

  return { path, bytes, summary, remove };
}

function pack({ root, files, path }: { root: string; files: string[]; path: string }) {
  const packer = new Pack({ gzip: true, portable: true, cwd: root });
  const out = createWriteStream(path);

  const done = new Promise<void>((resolve, reject) => {
    out.on('close', resolve);
    out.on('error', reject);
    packer.on('error', reject);
  });

  packer.pipe(out);

  for (const file of files) packer.add(file);

  packer.end();

  return done;
}

function formatSize(bytes: number): string {
  return bytes < 1_000_000
    ? `${(bytes / 1_000).toFixed(1)} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
