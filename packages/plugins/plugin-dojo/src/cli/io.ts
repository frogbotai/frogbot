import { spawn } from 'node:child_process';

import * as p from '@clack/prompts';
import type { SanitizedConfig } from 'payload';

import { ShareError } from './error.js';

/** The questions `share` can ask; only called with a TTY. */
export type SharePrompts = {
  confirm: (message: string) => Promise<boolean>;
  select: (message: string, options: { value: string; label: string }[]) => Promise<string>;
  /** Every option starts ticked. */
  multiselect: (message: string, options: { value: string; label: string }[]) => Promise<string[]>;
};

/** The environment `share` reads: `process.env`, or a test's own values. */
export type ShareEnv = Record<string, string | undefined>;

/** Everything `share` and `logout` touch outside the app folder, so tests can drive them. */
export type ShareIO = {
  /** How the command was run, for usage lines: `frogbot` in an app, `npx @frogbotai/plugin-dojo` from the bin. */
  program: string;
  cwd: string;
  env: ShareEnv;
  stdout: { write: (text: string) => unknown };
  stderr: { write: (text: string) => unknown };
  /** Both stdin and stdout are terminals, so a person can answer. */
  isTTY: boolean;
  prompts: SharePrompts;
  openBrowser: (url: string) => void;
  loadConfig: (root: string) => Promise<ShareConfig>;
};

/** The parts of Payload's sanitized config `share` reads, built without connecting to the database. */
export type ShareConfig = Pick<SanitizedConfig, 'collections' | 'db'>;

function answered<T>(value: T | symbol): T {
  if (typeof value === 'symbol') {
    p.cancel('Cancelled.');

    throw new ShareError('Cancelled.');
  }

  return value;
}

const clackPrompts: SharePrompts = {
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

async function loadShareConfig(root: string): Promise<ShareConfig> {
  const { loadConfig } = await import('frogbot/internal');
  const config = await loadConfig({ cwd: root, mode: 'codegen' });

  return config._internal.payloadConfig;
}

/** The real terminal, browser and app config. */
export function processIO(program: string): ShareIO {
  return {
    program,
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompts: clackPrompts,
    openBrowser,
    loadConfig: loadShareConfig,
  };
}

/** Writes one line to stdout. */
export function say(io: ShareIO, line: string): void {
  io.stdout.write(`${line}\n`);
}
