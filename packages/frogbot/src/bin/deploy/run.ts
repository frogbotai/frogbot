import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { formatCliError } from '../formatCliError.js';
import { checkLockfile, findAppRoot } from './appRoot.js';
import { dockerfile } from './dockerfile.js';
import { readDeployEnv } from './env.js';
import { DeployError } from './error.js';
import { checkMigrations, checkSecret, hasDockerfile } from './preflight.js';
import type {
  DeployConfig,
  DeployContext,
  DeployIO,
  DeployTarget,
  PreflightIssue,
} from './types.js';

export type RunDeployOptions = {
  /** The name it was run as, for messages and `--json`. */
  name: string;
  /**
   * Builds the app's Dockerfile and runs it in production, so `prodMigrations`, `FROGBOT_SECRET` and a
   * `Dockerfile` are checked too. Dojo builds its own image and syncs the schema itself.
   */
  image?: boolean;
};

type SharedFlags = { dryRun: boolean; json: boolean; noInteractive: boolean; envFile?: string };

/** Splits the flags every target takes from the ones the target parses. */
export function splitDeployArgs(argv: string[]): { flags: SharedFlags; args: string[] } {
  const flags: SharedFlags = { dryRun: false, json: false, noInteractive: false };
  const args: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? '';

    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--no-interactive') flags.noInteractive = true;
    else if (arg.startsWith('--env-file=')) flags.envFile = arg.slice('--env-file='.length);
    else if (arg === '--env-file') {
      const value = argv[++index];

      if (!value || value.startsWith('--')) {
        throw new DeployError('--env-file needs a path: --env-file .env.production', 2);
      }

      flags.envFile = value;
    } else args.push(arg);
  }

  return { flags, args };
}

const quote = (arg: string) =>
  /^[\w@%+=:,./•-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;

function showCommand(command: string, args: string[], mask: string[] = []): string {
  const masked = args.map((arg) =>
    mask.reduce((shown, secret) => (secret ? shown.split(secret).join('••••') : shown), arg),
  );

  return [command, ...masked].map(quote).join(' ');
}

function formatIssues(name: string, issues: PreflightIssue[]): string {
  const lines = issues.map(
    ({ code, message, fix }) => `[frogbot] ${code} ${message}\n  fix: ${fix}`,
  );

  const count = `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'}`;

  return `${lines.join('\n')}\n[frogbot] deploy ${name} stopped before changing anything: ${count}.\n`;
}

async function loadIssues(
  io: DeployIO,
  root: string,
): Promise<{ config?: DeployConfig; issue?: PreflightIssue }> {
  try {
    return { config: await io.loadConfig(root) };
  } catch (error) {
    return {
      issue: {
        code: 'CONFIG_INVALID',
        message: formatCliError(error).replace(/^\[frogbot\] /, ''),
        fix: 'Run `frogbot check` and fix what it reports.',
      },
    };
  }
}

/**
 * Runs one deploy target: the shared flags, every preflight check at once, then the target. Returns
 * the exit code: 0 on success, 1 when a check or the deploy failed, 2 for a usage error.
 */
export async function runDeploy(
  target: DeployTarget,
  argv: string[],
  io: DeployIO,
  { name, image = false }: RunDeployOptions,
): Promise<number> {
  let json = argv.includes('--json');
  let dryRun = false;
  const steps: string[] = [];
  const out = () => (json ? io.stderr : io.stdout);
  const log = (line: string) => out().write(`${line}\n`);

  const finish = (
    code: number,
    fields: { issues?: PreflightIssue[]; result?: unknown; error?: string },
  ) => {
    if (json) {
      const result =
        dryRun && code === 0
          ? { steps, ...(isObject(fields.result) ? fields.result : {}) }
          : fields.result;

      io.stdout.write(
        `${JSON.stringify({ target: name, ok: code === 0, dryRun, issues: fields.issues ?? [], result: result ?? null, ...(fields.error ? { error: fields.error } : {}) })}\n`,
      );
    }

    return code;
  };

  try {
    const { flags, args } = splitDeployArgs(argv);

    json = flags.json;
    dryRun = flags.dryRun;

    const interactive = io.isTTY && !flags.noInteractive && !flags.json;
    const root = findAppRoot({ cwd: io.cwd, env: io.env });
    const env = readDeployEnv(root, { envFile: flags.envFile, shell: io.env });
    const { config, issue: configIssue } = await loadIssues(io, root);

    const issues = [checkLockfile(root), configIssue].filter(isIssue);
    const dockerfileMissing = image && !hasDockerfile(root);

    if (image) issues.push(...[checkSecret({ env })].filter(isIssue));

    if (dockerfileMissing) {
      issues.push({
        code: 'DOCKERFILE_MISSING',
        message: 'No Dockerfile in the app.',
        fix: `Run \`${io.program} deploy ${name}\` in a terminal to write FrogBot's template Dockerfile, or copy it from https://github.com/frogbotai/frogbot/blob/main/templates/blank/Dockerfile`,
      });
    }

    if (!config) {
      io.stderr.write(formatIssues(name, issues));

      return finish(1, { issues });
    }

    const context: DeployContext = {
      root,
      config,
      flags: { dryRun, json, interactive },
      args,
      env,
      io: { ...io, isTTY: interactive },
      log,
      run: async (command, commandArgs, { mask, quiet, ...options } = {}) => {
        const shown = showCommand(command, commandArgs, mask);

        steps.push(`$ ${shown}`);

        if (dryRun) {
          log(`[dry-run] $ ${shown}`);

          return { code: 0, stdout: '', stderr: '' };
        }

        log(`$ ${shown}`);

        const result = await io.exec(command, commandArgs, {
          cwd: root,
          onOutput: quiet ? undefined : (text) => out().write(text),
          ...options,
        });

        if (result.code !== 0) {
          const tail = quiet ? result.stderr.trim().split('\n').slice(-5).join('\n') : '';

          throw new DeployError(
            `\`${command} ${commandArgs[0] ?? ''}\` failed (exit ${result.code}).${tail ? `\n${tail}` : ''}`,
          );
        }

        return result;
      },
      writeFile: async (path, contents) => {
        steps.push(`write ${path}`);

        if (dryRun) {
          log(`[dry-run] write ${path}`);

          return;
        }

        await writeFile(join(root, path), contents);
        log(`[frogbot] Wrote ${path}.`);
      },
    };

    if (image) issues.push(...[checkMigrations(config)].filter(isIssue));

    issues.push(...(await target.preflight(context)));

    const onlyDockerfile = issues.length === 1 && dockerfileMissing;

    if (onlyDockerfile && interactive && !dryRun) {
      if (await io.prompts.confirm("No Dockerfile. Write FrogBot's template Dockerfile?")) {
        await context.writeFile('Dockerfile', dockerfile);
        issues.length = 0;
      }
    }

    if (issues.length > 0) {
      io.stderr.write(formatIssues(name, issues));

      return finish(1, { issues });
    }

    const result = await target.run(context);

    if (dryRun) log(`[frogbot] Dry run of deploy ${name}: nothing was changed.`);

    return finish(0, { result });
  } catch (error) {
    if (!(error instanceof DeployError)) throw error;

    io.stderr.write(`[frogbot] ${error.message}\n`);

    return finish(error.code, { error: error.message });
  }
}

function isIssue(issue: PreflightIssue | undefined): issue is PreflightIssue {
  return issue !== undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
