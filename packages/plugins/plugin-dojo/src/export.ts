import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, statfs } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { DatabaseAdapter, Endpoint, FrogBotConfig } from 'frogbot';

import { cleanSnapshot, type TableCollection } from './cli/data/inventory.js';
import type { DojoEnv } from './env.js';

/** The only keys Dojo may ask for: `.dojo/export/<id>.db` in the app's bucket. */
export const exportKeyPattern = /^\.dojo\/export\/[A-Za-z0-9-]{1,64}\.db$/;

type ExportError = 'unauthorized' | 'invalid_key' | 'not_sqlite' | 'no_database' | 'disk_full';

const statuses: Record<ExportError, number> = {
  unauthorized: 401,
  invalid_key: 400,
  not_sqlite: 409,
  no_database: 404,
  disk_full: 507,
};

const refuse = (error: ExportError) => Response.json({ error }, { status: statuses[error] });

const digest = (value: string) => createHash('sha256').update(value).digest();

/** The SQLite file a `file:` URL names, as the app's own process resolves it. */
export function databaseFile(url: string | undefined, cwd: string): string | undefined {
  if (!url?.startsWith('file:')) return undefined;

  const [location = ''] = url.split('?');
  const path = location.startsWith('file://') ? fileURLToPath(location) : location.slice(5);

  return path && path !== ':memory:' ? resolve(cwd, decodeURIComponent(path)) : undefined;
}

async function sizeOf(path: string): Promise<number> {
  const sizes = await Promise.all(
    ['', '-wal'].map((suffix) =>
      stat(path + suffix).then(
        (s) => s.size,
        () => 0,
      ),
    ),
  );

  return sizes.reduce((sum, size) => sum + size, 0);
}

const isDiskFull = (error: unknown) =>
  error instanceof Error &&
  ((error as { code?: string }).code === 'ENOSPC' ||
    /SQLITE_FULL|database or disk is full/i.test(error.message));

export type ExportUpload = (args: { key: string; path: string }) => Promise<void>;

/** Streams the file to the app's own bucket with the keys Dojo gave it, in parts for a big one. */
export function r2Upload(env: DojoEnv): ExportUpload {
  return async ({ key, path }) => {
    const client = new S3Client({
      endpoint: env.r2Endpoint,
      region: 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
    });

    try {
      await new Upload({
        client,
        params: { Bucket: env.r2Bucket, Key: key, Body: createReadStream(path) },
        partSize: 16 * 1024 * 1024,
        queueSize: 2,
      }).done();
    } finally {
      client.destroy();
    }
  };
}

/**
 * `POST /api/dojo/export`, for Dojo only (`Authorization: Bearer <DOJO_JOBS_SECRET>`): copies the
 * database with the adapter's snapshot, so writers don't wait, empties what a share empties (jobs,
 * waitpoints, locks, KV, trigger subscriptions and sessions), and uploads the copy to `key` in the
 * app's bucket. Refuses with `disk_full` when the database's disk lacks room for the copy and its
 * cleaning, twice the database's size, and leaves nothing behind either way.
 */
export function dojoExportEndpoint({
  env,
  collections,
  upload = r2Upload(env),
  cwd = process.cwd(),
  databaseUrl = () => process.env.DATABASE_URL,
}: {
  env: DojoEnv;
  /** The app's collections, whose auth ones have `_sessions` tables to empty. */
  collections: TableCollection[];
  upload?: ExportUpload;
  cwd?: string;
  databaseUrl?: () => string | undefined;
}): Endpoint {
  const expected = digest(`Bearer ${env.jobsSecret}`);

  return {
    path: '/dojo/export',
    method: 'post',
    handler: async (req) => {
      const header = req.headers.get('authorization');

      if (header === null || !timingSafeEqual(digest(header), expected)) {
        return refuse('unauthorized');
      }

      const body = (await req.json?.().catch(() => null)) as { key?: unknown } | null;
      const key = body?.key;

      if (typeof key !== 'string' || !exportKeyPattern.test(key)) return refuse('invalid_key');

      const { snapshot } = req.frogbot.db as Pick<DatabaseAdapter, 'snapshot'>;
      const database = databaseFile(databaseUrl(), cwd);

      if (!snapshot || !database) return refuse('not_sqlite');

      const size = await sizeOf(database);

      if (size === 0) return refuse('no_database');

      const { bavail, bsize } = await statfs(dirname(database));

      if (bavail * bsize < 2 * size) return refuse('disk_full');

      let folder: string | undefined;

      try {
        folder = await mkdtemp(join(dirname(database), '.dojo-export-'));

        const to = join(folder, 'frogbot.db');
        const copy = await snapshot({ cwd, to });

        if (!copy) return refuse('no_database');

        try {
          await cleanSnapshot(copy, collections);
        } finally {
          await copy.close();
        }

        await upload({ key, path: to });

        return Response.json({ key, bytes: (await stat(to)).size });
      } catch (error) {
        if (isDiskFull(error)) return refuse('disk_full');

        throw error;
      } finally {
        if (folder) await rm(folder, { recursive: true, force: true });
      }
    },
  };
}

/** Adds `POST /api/dojo/export`, which Dojo calls to hand an app's owners its data. */
export function withDojoExport(config: FrogBotConfig, env: DojoEnv): FrogBotConfig {
  return {
    ...config,
    endpoints: [
      ...(config.endpoints ?? []),
      dojoExportEndpoint({ env, collections: config.collections }),
    ],
  };
}
