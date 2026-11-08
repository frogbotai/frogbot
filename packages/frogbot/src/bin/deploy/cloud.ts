import type { ParseArgsOptionsConfig } from 'node:util';

import { appSlug, parseTargetArgs } from './app.js';
import { DeployError } from './error.js';
import { checkLocalDatabase, checkLocalUploads, hasScheduledJobs } from './preflight.js';
import type { DeployContext, PreflightIssue } from './types.js';

const cloudOptions = {
  region: { type: 'string' },
  service: { type: 'string' },
  'min-instances': { type: 'string' },
} as const;

export type CloudFlags = {
  region?: string;
  /** `--service`, or the app's `package.json` name. */
  service: string;
  /** 1 unless `--min-instances 0`: always on, so scheduled jobs run on time. */
  minInstances: 0 | 1;
  /** Every parsed flag, including the target's own. */
  values: Record<string, unknown>;
};

/** A string flag from `values`, or `undefined`. */
export function stringFlag(values: Record<string, unknown>, name: string): string | undefined {
  const value = values[name];

  return typeof value === 'string' ? value : undefined;
}

/** The flags every cloud target takes, plus the target's own `options`. */
export function readCloudFlags<T extends ParseArgsOptionsConfig>(
  context: DeployContext,
  { target, usage, options }: { target: string; usage: string; options: T },
): CloudFlags {
  const values: Record<string, unknown> = parseTargetArgs(context, {
    target,
    usage: `[--region <region>] [--service <name>] [--min-instances 0|1] ${usage}`.trim(),
    options: { ...cloudOptions, ...options },
  });

  const raw = stringFlag(values, 'min-instances');

  if (raw !== undefined && raw !== '0' && raw !== '1') {
    throw new DeployError(
      `--min-instances is 0 or 1: a cloud deploy runs one copy at most (got ${raw}).`,
      2,
    );
  }

  const service = stringFlag(values, 'service') ?? appSlug(context.root);

  if (!/^[a-z][a-z0-9-]{0,48}$/.test(service)) {
    throw new DeployError(
      `--service ${service}: use lowercase letters, digits and dashes, starting with a letter.`,
      2,
    );
  }

  return {
    region: stringFlag(values, 'region'),
    service,
    minInstances: raw === '0' ? 0 : 1,
    values,
  };
}

/** `LOCAL_DATABASE` and `LOCAL_UPLOADS`: data a cloud container would lose on restart. */
export function cloudIssues(context: DeployContext, storagePackage: string): PreflightIssue[] {
  return [checkLocalDatabase(context), checkLocalUploads(context.config, storagePackage)].filter(
    (issue): issue is PreflightIssue => issue !== undefined,
  );
}

/** Warns that scheduled jobs wait for a request when the app may scale to zero. */
export function warnIdleJobs(context: DeployContext, minInstances: 0 | 1): void {
  if (minInstances === 0 && hasScheduledJobs(context.config)) {
    context.log(
      '[frogbot] --min-instances 0: the app stops when idle, so its scheduled jobs wait until a request wakes it.',
    );
  }
}
