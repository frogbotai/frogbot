import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { DatabaseAdapter } from '../../database/types.js';
import { WAITPOINT_SWEEP_TASK_SLUG } from '../../jobs/config.js';
import type { DeployConfig, DeployContext, DeployIO, PreflightIssue } from './types.js';

/**
 * `MIGRATIONS_NOT_WIRED`: production applies only `prodMigrations`, so without them the first request
 * fails with "no such table". Skipped for adapters that don't report them, such as MongoDB's.
 */
export function checkMigrations(config: DeployConfig): PreflightIssue | undefined {
  const db: Pick<DatabaseAdapter, 'name' | 'prodMigrations'> = config.db;

  if (!('prodMigrations' in db)) return undefined;

  const migrations = db.prodMigrations;

  if (Array.isArray(migrations) && migrations.length > 0) return undefined;

  return {
    code: 'MIGRATIONS_NOT_WIRED',
    message: Array.isArray(migrations)
      ? '`prodMigrations` is empty, so the deployed database gets no tables.'
      : 'The database adapter has no `prodMigrations`, so the deployed database gets no tables ("no such table: users").',
    fix: 'Run `frogbot migrate:create init`, then pass `prodMigrations: migrations` (from `./migrations`) to the database adapter. See https://docs.frogbot.ai/deployment/overview#migrations',
  };
}

/** A production variable: see `DeployContext.env`. */
export function readVariable(context: Pick<DeployContext, 'env'>, name: string): string {
  return context.env[name] ?? '';
}

/** `SECRET_MISSING`: `FROGBOT_SECRET` signs sessions and seals stored connections. */
export function checkSecret(context: Pick<DeployContext, 'env'>): PreflightIssue | undefined {
  if (readVariable(context, 'FROGBOT_SECRET')) return undefined;

  return {
    code: 'SECRET_MISSING',
    message: 'FROGBOT_SECRET is empty.',
    fix: 'Set FROGBOT_SECRET in .env (or the file --env-file names) to a long random string, for example from `openssl rand -hex 32`.',
  };
}

/** Whether the app has a `Dockerfile`. */
export function hasDockerfile(root: string): boolean {
  return existsSync(join(root, 'Dockerfile'));
}

/** `LOCAL_DATABASE`: a cloud container's disk is wiped on every restart. */
export function checkLocalDatabase(context: DeployContext): PreflightIssue | undefined {
  const url = readVariable(context, 'DATABASE_URL');

  if (url && !url.startsWith('file:') && url !== ':memory:') return undefined;

  return {
    code: 'LOCAL_DATABASE',
    message: url
      ? `DATABASE_URL is a local file (${url}), which the cloud wipes on every restart.`
      : 'DATABASE_URL is empty.',
    fix: 'Point DATABASE_URL at a hosted database: Postgres with @frogbotai/db-postgres (Neon, Supabase, Cloud SQL, RDS), or Turso (libsql://) with @frogbotai/db-sqlite.',
  };
}

/** `LOCAL_UPLOADS`: upload collections that keep files on the container's disk. */
export function checkLocalUploads(
  config: DeployConfig,
  storagePackage: string,
): PreflightIssue | undefined {
  const local = config.collections
    .filter((collection) => collection.upload && !collection.upload.disableLocalStorage)
    .map((collection) => collection.slug);

  if (local.length === 0) return undefined;

  return {
    code: 'LOCAL_UPLOADS',
    message: `Uploads to ${local.join(', ')} are saved on the container's disk, which the cloud wipes on every restart.`,
    fix: `Add a storage adapter, such as ${storagePackage}, to the config's \`storage\`. See https://docs.frogbot.ai/upload/storage-adapters`,
  };
}

/** `TOOL_MISSING` when none of `commands` is on `PATH`; otherwise the first one found. */
export async function findTool(
  io: DeployIO,
  commands: string[],
  install: string,
): Promise<{ command?: string; issue?: PreflightIssue }> {
  for (const command of commands) {
    if (await io.which(command)) return { command };
  }

  return {
    issue: {
      code: 'TOOL_MISSING',
      message: `\`${commands[0]}\` isn't installed.`,
      fix: install,
    },
  };
}

/** `NOT_LOGGED_IN` when `command args` exits non-zero. */
export async function checkLogin(
  io: DeployIO,
  command: string,
  args: string[],
  login: string,
): Promise<PreflightIssue | undefined> {
  const { code } = await io.exec(command, args);

  if (code === 0) return undefined;

  return {
    code: 'NOT_LOGGED_IN',
    message: `\`${command}\` isn't logged in.`,
    fix: `Run \`${login}\`.`,
  };
}

/** The app's own scheduled tasks and workflows, which need a running instance to fire. */
export function hasScheduledJobs(config: DeployConfig): boolean {
  const scheduled = (items: { slug: string; schedule?: unknown[] }[] | undefined) =>
    (items ?? []).some(
      (item) => item.slug !== WAITPOINT_SWEEP_TASK_SLUG && (item.schedule?.length ?? 0) > 0,
    );

  return scheduled(config.jobs?.tasks) || scheduled(config.jobs?.workflows);
}
