import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

import * as p from '@clack/prompts';
import type { DeployIO, DeployPrompts } from 'frogbot';

import { ShareError } from './error.js';

/**
 * What the Dojo commands use from the terminal: core's `DeployIO` without what only `frogbot deploy`
 * needs, so they run with no FrogBot app.
 */
export type DojoIO = Omit<DeployIO, 'exec' | 'which' | 'loadConfig'> & {
  /** With `--json`: the real stdout, which gets only the command's one JSON result; `stdout` is then stderr. */
  json?: { write: (text: string) => unknown };
  /** With `--wait`: wait for a sign-in or a payment even without a terminal. */
  waits?: boolean;
};

/** Whether someone may be waited for: a terminal, or `--wait`. Otherwise a needed sign-in or payment exits. */
export function canWait(io: Pick<DojoIO, 'isTTY' | 'waits'>): boolean {
  return io.isTTY || io.waits === true;
}

/** The Dojo commands' program, also from `frogbot deploy dojo`: `frogbot dojo`, or `npx @frogbotai/plugin-dojo`. */
export function dojoProgram(program: string): string {
  return /(?:dojo|plugin-dojo)$/.test(program) ? program : `${program} dojo`;
}

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

/** Ends a command: with `--json`, its one JSON value on stdout; otherwise its human lines. */
export function done(
  io: Pick<DojoIO, 'stdout' | 'json'>,
  value: unknown,
  lines: string[] = [],
): void {
  if (io.json) {
    io.json.write(`${JSON.stringify(value, null, 2)}\n`);

    return;
  }

  for (const line of lines) say(io, line);
}

/** `io` for `--json`: human lines go to stderr, leaving stdout to the result. */
export function jsonIO(io: DojoIO): DojoIO {
  return { ...io, stdout: io.stderr, json: io.stdout };
}
