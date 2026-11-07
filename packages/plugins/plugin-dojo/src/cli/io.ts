import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

import * as p from '@clack/prompts';
import type { DeployIO, DeployPrompts } from 'frogbot';

import { ShareError } from './error.js';

/** What the Dojo commands use from the terminal: `share` gets core's full `DeployIO`, the others need no FrogBot app. */
export type DojoIO = Omit<DeployIO, 'exec' | 'which' | 'loadConfig'>;

function answered<T>(value: T | symbol): T {
  if (typeof value === 'symbol') {
    p.cancel('Cancelled.');

    throw new ShareError('Cancelled.');
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

/** The real terminal and browser. */
export function processIO(program: string): DojoIO {
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
  };
}

/** Writes one line to stdout. */
export function say(io: Pick<DojoIO, 'stdout'>, line: string): void {
  io.stdout.write(`${line}\n`);
}
