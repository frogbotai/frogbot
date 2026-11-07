import { relative } from 'node:path';
import { parseArgs } from 'node:util';

import type { SanitizedConfig } from 'payload';

import { ConfigIssueError } from '../config/issue.js';
import { loadConfig, resolveConfigDir } from '../config/load.js';
import { writeGeneratedTypes } from '../typegen/index.js';
import { formatCliError } from './formatCliError.js';
import { generateImportMap } from './generateImportMap/index.js';

type CheckIssue = { code: string; path?: string; message: string };

type CheckResult = { issues: CheckIssue[]; warnings: CheckIssue[] };

const prefix = '[frogbot] ';

const iconDocs = 'https://docs.frogbot.ai/admin/admin-navigation#collection-icons-and-placement';

function stripPrefix(message: string): string {
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

function findIssueError(error: unknown): ConfigIssueError | undefined {
  const seen = new Set<unknown>();

  for (let cause = error; cause instanceof Error && !seen.has(cause); cause = cause.cause) {
    if (cause instanceof ConfigIssueError) return cause;

    seen.add(cause);
  }

  return undefined;
}

async function collectIssues(cwd: string): Promise<CheckResult> {
  try {
    return await findIssues(cwd);
  } catch (error) {
    const issue = findIssueError(error);

    return {
      issues: [
        issue
          ? { code: issue.code, path: issue.path, message: stripPrefix(issue.message) }
          : { code: 'CONFIG_INVALID', message: stripPrefix(formatCliError(error)) },
      ],
      warnings: [],
    };
  }
}

/** Finds collections that show in the sidebar with no `admin.icon`, so they render the folder. */
export function findMissingIcons(collections: SanitizedConfig['collections']): CheckIssue[] {
  return collections
    .filter(({ admin, auth }) => {
      const { icon } = admin as { icon?: unknown };

      return !auth && !icon && !admin.hidden && admin.group !== false;
    })
    .map(({ slug }) => ({
      code: 'MISSING_ICON',
      path: `collections.${slug}`,
      message: `no admin.icon, so the sidebar shows a folder; pick one: ${iconDocs}`,
    }));
}

async function findIssues(cwd: string): Promise<CheckResult> {
  const config = await loadConfig({ cwd, mode: 'runtime' });
  const payloadConfig = await config._internal.payloadConfig;
  const issues: CheckIssue[] = [];
  const types = await writeGeneratedTypes(config, resolveConfigDir(cwd) ?? cwd, { dryRun: true });

  if (types.changed) {
    issues.push({
      code: 'TYPES_STALE',
      path: relative(cwd, types.outputPath),
      message: 'out of date; run `frogbot generate:types`',
    });
  }

  if (config.admin?.importMap?.autoGenerate !== false) {
    const importMap = await generateImportMap(payloadConfig, {
      dryRun: true,
      ignoreResolveError: true,
    });

    if (importMap?.changed) {
      issues.push({
        code: 'IMPORT_MAP_STALE',
        path: relative(cwd, importMap.outputPath),
        message: 'out of date; run `frogbot generate:importmap`',
      });
    }
  }

  return { issues, warnings: findMissingIcons(payloadConfig.collections) };
}

function count(length: number, noun: string): string {
  return `${length} ${length === 1 ? noun : `${noun}s`}`;
}

function formatIssue({ code, path, message }: CheckIssue, label = ''): string {
  return `${prefix}${label}${code} ${path ? `${path}: ` : ''}${message}`;
}

function logToStderr(): () => void {
  const { debug, info, log } = console;

  console.log = console.info = console.debug = console.error;

  return () => Object.assign(console, { debug, info, log });
}

/** Loads the config as the running app does, with no server or database, and reports what's wrong. */
export async function check(args: string[] = []): Promise<void> {
  const { values } = parseArgs({ args, options: { json: { type: 'boolean' } } });
  const restore = values.json ? logToStderr() : () => undefined;
  let result: CheckResult;

  try {
    result = await collectIssues(process.cwd());
  } finally {
    restore();
  }

  const { issues, warnings } = result;

  if (issues.length) process.exitCode = 1;

  if (values.json) {
    const output = {
      command: 'check',
      success: !issues.length,
      ...(issues.length && {
        error: {
          code: 'CHECK_FAILED',
          message: `${count(issues.length, 'issue')} found`,
          issues,
        },
      }),
      ...(warnings.length && { warnings }),
    };

    process.stdout.write(`${JSON.stringify(output)}\n`);

    return;
  }

  for (const warning of warnings) console.error(formatIssue(warning, 'warning '));

  if (!issues.length) {
    console.log(
      `[frogbot] check passed${warnings.length ? ` with ${count(warnings.length, 'warning')}` : ''}. Not checked: TypeScript (run your typecheck script) and migrations (run \`frogbot migrate:status\`).`,
    );

    return;
  }

  for (const issue of issues) console.error(formatIssue(issue));

  console.error(`${prefix}${count(issues.length, 'issue')} found`);
}
