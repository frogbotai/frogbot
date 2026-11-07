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

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

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

  return { issues, warnings: findMissingIcons(payloadConfig) };
}

function findMissingIcons(payloadConfig: SanitizedConfig): CheckIssue[] {
  return payloadConfig.collections
    .filter(({ admin }) => {
      const { group, hidden, icon } = admin as typeof admin & { icon?: unknown };

      return !icon && !hidden && group !== false;
    })
    .map(({ slug }) => ({
      code: 'MISSING_ICON',
      path: `collections.${slug}`,
      message: `no admin.icon, so the sidebar shows a folder; pick one: ${iconDocs}`,
    }));
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
  const withWarnings = warnings.length ? { warnings } : {};

  if (issues.length) process.exitCode = 1;

  if (values.json) {
    const output = issues.length
      ? {
          command: 'check',
          success: false,
          error: {
            code: 'CHECK_FAILED',
            message: `${plural(issues.length, 'issue')} found`,
            issues,
          },
          ...withWarnings,
        }
      : { command: 'check', success: true, ...withWarnings };

    process.stdout.write(`${JSON.stringify(output)}\n`);

    return;
  }

  for (const { code, path, message } of warnings) {
    console.error(`${prefix}warning ${code} ${path}: ${message}`);
  }

  if (!issues.length) {
    console.log(
      `[frogbot] check passed${warnings.length ? ` with ${plural(warnings.length, 'warning')}` : ''}. Not checked: TypeScript (run your typecheck script) and migrations (run \`frogbot migrate:status\`).`,
    );

    return;
  }

  for (const { code, path, message } of issues) {
    console.error(`${prefix}${code} ${path ? `${path}: ` : ''}${message}`);
  }

  console.error(`${prefix}${plural(issues.length, 'issue')} found`);
}
