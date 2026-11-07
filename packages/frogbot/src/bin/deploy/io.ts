import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import * as p from '@clack/prompts';

import { DeployError } from './error.js';
import type { DeployConfig, DeployExecResult, DeployIO, DeployPrompts } from './types.js';

function answered<T>(value: T | symbol): T {
  if (typeof value === 'symbol') {
    p.cancel('Cancelled.');

    throw new DeployError('Cancelled.');
  }

  return value;
}

const clackPrompts: DeployPrompts = {
  confirm: async (message) => answered<boolean>(await p.confirm({ message, initialValue: true })),
  select: async (message, options) => answered<string>(await p.select({ message, options })),
  multiselect: async (message, options) =>
    answered<string[]>(
      await p.multiselect({
        message,
        options,
        initialValues: options.map((option) => option.value),
        required: false,
      }),
    ),
};

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];

  const child = spawn(command, args, { detached: true, stdio: 'ignore' });

  child.on('error', () => {});
  child.unref();
}

const exec: DeployIO['exec'] = (command, args, options = {}) =>
  new Promise<DeployExecResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      options.onOutput?.(chunk.toString());
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      options.onOutput?.(chunk.toString());
    });

    child.on('error', (error) => resolve({ code: 127, stdout, stderr: stderr + error.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(options.input ?? '');
  });

async function which(command: string): Promise<boolean> {
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      try {
        await access(join(dir, command + extension), constants.X_OK);

        return true;
      } catch {
        continue;
      }
    }
  }

  return false;
}

/** The real terminal, browser, programs and app config. */
export function processDeployIO({
  program,
  loadConfig,
}: {
  program: string;
  loadConfig: (root: string) => Promise<DeployConfig>;
}): DeployIO {
  return {
    program,
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompts: clackPrompts,
    openBrowser,
    wait: setTimeout,
    loadConfig,
    exec,
    which,
  };
}
