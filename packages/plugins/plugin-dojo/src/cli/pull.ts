import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

import { x } from 'tar';

import { unzipTo, ZipError } from './data/unzip.js';
import { formatBytes } from './data/upload.js';
import { takeUploadFolders } from './data/uploadFolders.js';
import type { DojoClient } from './dojo.js';
import { createDojo, dojoMessage, segment } from './dojo.js';
import { ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { done, say } from './io.js';
import { writeLink } from './link.js';

const usage = (program: string) => `Usage: ${program} apps pull <app> [--data]`;

const slugPattern = /^[a-z0-9][a-z0-9-]*$/;

type App = { id: string | number; slug: string; secret?: unknown };

const databaseEntry = 'frogbot.db';

/** Runs `frogbot dojo apps pull <app>` and returns its exit code; known stops print one `[frogbot]` line. */
export async function runPull(args: string[], io: DojoIO): Promise<number> {
  try {
    return await pull(args, io);
  } catch (error) {
    if (!(error instanceof ShareError)) throw error;

    io.stderr.write(`[frogbot] ${error.message}\n`);

    return error.code;
  }
}

async function pull(args: string[], io: DojoIO): Promise<number> {
  const withData = args.includes('--data');
  const rest = args.filter((arg) => arg !== '--data');
  const [name] = rest;

  if (rest.length !== 1 || !name || name.startsWith('-')) {
    throw new ShareError(usage(io.program), 2);
  }

  const dojo = createDojo(io);

  await dojo.signIn();

  const looked = await dojo.request(`/api/apps/${segment(name)}/cli${withData ? '?secret=1' : ''}`);

  if (!looked.ok) throw new ShareError(await dojoMessage(looked));

  const app = (await looked.json()) as Partial<App>;

  if (
    (typeof app.id !== 'string' && typeof app.id !== 'number') ||
    typeof app.slug !== 'string' ||
    !slugPattern.test(app.slug)
  ) {
    throw new ShareError("Couldn't read the app: Dojo sent no id or slug.");
  }

  const { id, slug } = app as App;
  const appSecret = typeof app.secret === 'string' && app.secret ? app.secret : undefined;
  const dest = resolve(io.cwd, slug);

  if (await exists(dest)) {
    throw new ShareError(`./${slug} already exists; pull somewhere else or remove it.`);
  }

  const source = await dojo.request(`/api/apps/${segment(id)}/source`, () => ({
    headers: { accept: 'application/gzip' },
  }));

  if (!source.ok || !source.body) throw new ShareError(await dojoMessage(source));

  const staging = await mkdtemp(join(io.cwd, '.frogbot-pull-'));
  let data: PulledData | string | undefined;

  try {
    await pipeline(
      Readable.fromWeb(source.body as ReadableStream<Uint8Array>),
      x({
        cwd: staging,
        strict: true,
        filter: (_, entry) =>
          'type' in entry && (entry.type === 'File' || entry.type === 'Directory'),
      }),
    ).catch((error: unknown) => {
      throw new ShareError(`Couldn't unpack the app's source: ${(error as Error).message}`);
    });

    if (withData) data = await pullData(dojo, id, staging, io.cwd);

    await writeLink(staging, { appId: id });

    const secret = (typeof data === 'object' && appSecret) || randomBytes(24).toString('hex');

    const databaseUrl = (await usesPostgres(staging))
      ? `postgres://postgres:postgres@127.0.0.1:5432/${slug}`
      : 'file:./frogbot.db';

    await writeFile(
      join(staging, '.env'),
      `DATABASE_URL=${databaseUrl}\nFROGBOT_SECRET=${secret}\n`,
      {
        mode: 0o600,
      },
    );

    await rename(staging, dest);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  if (typeof data === 'string') say(io, `[frogbot] ${data} Pulling the code only.`);

  say(
    io,
    typeof data === 'object'
      ? `[frogbot] Pulled ${slug} into ./${slug} with its data: ${describePulled(data)}.${appSecret ? '' : ' Connections stored in it need reconnecting here.'}`
      : `[frogbot] Pulled ${slug} into ./${slug}. It starts with an empty database; production keys stay on Dojo.`,
  );

  say(io, `cd ${slug}`);
  say(io, 'pnpm install');
  say(io, 'pnpm dev');

  done(io, {
    id,
    slug,
    path: dest,
    ...(typeof data === 'object' && { data: { database: data.databaseBytes, files: data.files } }),
  });

  return 0;
}

type PulledData = { databaseBytes: number; files: number };

const describePulled = ({ databaseBytes, files }: PulledData) =>
  `the database (${formatBytes(databaseBytes)}) and ${files} ${files === 1 ? 'file' : 'files'}`;

async function pullData(
  dojo: DojoClient,
  id: string | number,
  folder: string,
  cwd: string,
): Promise<PulledData | string> {
  const response = await dojo.request(`/api/apps/${segment(id)}/data`, () => ({
    headers: { accept: 'application/zip' },
  }));

  if (response.status === 403 || response.status === 404) return dojoMessage(response);
  if (!response.ok || !response.body) {
    throw new ShareError(`Couldn't download the app's data: ${await dojoMessage(response)}`);
  }

  const download = await mkdtemp(join(cwd, '.frogbot-data-'));
  const zip = join(download, 'data.zip');

  try {
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(zip),
    ).catch((error: unknown) => {
      throw new ShareError(`The data download stopped: ${(error as Error).message}`);
    });

    const size = (await stat(zip)).size;
    const unpack = (place: (name: string) => string | undefined) =>
      unzipTo({ path: zip, size, folder, place }).catch((error: unknown) => {
        if (error instanceof ZipError) {
          throw new ShareError(`Couldn't unpack the app's data: ${error.message}.`);
        }

        throw error;
      });

    const [database] = await unpack((name) => (name === databaseEntry ? name : undefined));
    const uploads = database ? takeUploadFolders(join(folder, databaseEntry)) : new Map();
    const files = await unpack((name) => {
      const [slug = '', ...rest] = name.split('/');
      const staticDir = uploads.get(slug);

      return staticDir && rest.length > 0 ? `${staticDir}/${rest.join('/')}` : undefined;
    });

    return { databaseBytes: database?.size ?? 0, files: files.length };
  } finally {
    await rm(download, { recursive: true, force: true });
  }
}

const postgresAdapters = ['@frogbotai/db-postgres', '@frogbotai/db-vercel-postgres'];

async function usesPostgres(folder: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };

    return postgresAdapters.some((name) => name in { ...pkg.dependencies, ...pkg.devDependencies });
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch {
    return false;
  }
}
