import fs from 'node:fs';

import { isFrogBotError } from '../errors/FrogBotError.js';
import { toProblem } from '../errors/toProblem.js';
import { formatCliError } from './formatCliError.js';

/** What a {@link CliError} carries besides its message. */
export type CliErrorOptions = {
  /** Stable, for scripts reading `--json`. Defaults to `USAGE_ERROR` for exit 2 and `FAILED` otherwise. */
  code?: string;
  /** `2` for a usage error, `1` (the default) for anything else. */
  exitCode?: number;
  /** The command already printed why, so `frogbot` prints nothing more without `--json`. */
  reported?: boolean;
  cause?: unknown;
};

/** A known stop: `frogbot` prints its message, or with `--json` the failure object, and exits with `exitCode`. */
export class CliError extends Error {
  code: string;
  exitCode: number;
  reported: boolean;

  constructor(
    message: string,
    { code, exitCode = 1, reported = false, cause }: CliErrorOptions = {},
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.reported = reported;
    this.code = code ?? (exitCode === 2 ? 'USAGE_ERROR' : 'FAILED');
  }
}

/** A usage error: exits 2. */
export const usageError = (message: string) => new CliError(message, { exitCode: 2 });

const isParseArgsError = (error: unknown) =>
  error instanceof Error &&
  String((error as { code?: unknown }).code).startsWith('ERR_PARSE_ARGS_');

/**
 * The exit code for `error`: a `CliError`'s own, a `FrogBotError`'s catalog `exit`, 2 for a flag
 * `parseArgs` refused, else 1.
 */
export function exitCodeOf(error: unknown): number {
  if (error instanceof CliError) return error.exitCode;
  if (isFrogBotError(error)) return typeof error.exit === 'number' ? error.exit : 1;

  return isParseArgsError(error) ? 2 : 1;
}

/** The arguments `frogbot` itself reads: before `--`, and for `run` only the one in place of the file. */
export function ownArgs(command: string, args: string[]): string[] {
  const end = args.indexOf('--');

  if (command === 'run') return args.slice(0, 1);

  return end < 0 ? args : args.slice(0, end);
}

/** `args` without the `--json` that `frogbot` read. */
export function withoutJson(command: string, args: string[]): string[] {
  const own = ownArgs(command, args).length;

  return [...args.slice(0, own).filter((arg) => arg !== '--json'), ...args.slice(own)];
}

/**
 * Sends everything written to stdout to stderr, so stdout holds only the JSON value: `console.log`,
 * `process.stdout.write`, and the database logger, which writes to file descriptor 1 itself. Returns the undo.
 */
export function logToStderr(): () => void {
  const { debug, info, log } = console;
  const { write } = process.stdout;
  const { write: fsWrite, writeSync } = fs;
  const toStderr = (fd: unknown) => (fd === 1 ? 2 : fd);

  console.log = console.info = console.debug = console.error;
  process.stdout.write = process.stderr.write.bind(process.stderr);

  fs.write = ((fd: number, ...rest: unknown[]) =>
    Reflect.apply(fsWrite, fs, [toStderr(fd), ...rest])) as typeof fsWrite;

  fs.writeSync = ((fd: number, ...rest: unknown[]) =>
    Reflect.apply(writeSync, fs, [toStderr(fd), ...rest])) as typeof writeSync;

  return () => {
    Object.assign(console, { debug, info, log });
    Object.assign(fs, { write: fsWrite, writeSync });
    process.stdout.write = write;
  };
}

/** Writes one JSON value and a newline to stdout. */
export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

/**
 * The `--json` result for a command that failed with `error`. A `FrogBotError`'s `error` is its
 * `Problem`, with `message` set to its `detail`.
 */
export function failureJson(command: string, error: unknown) {
  if (isFrogBotError(error)) {
    const problem = toProblem(error, { debug: true });

    return { command, success: false, error: { ...problem, message: problem.detail } };
  }

  const message = formatCliError(error).replace(/^\[frogbot\] /, '');

  return {
    command,
    success: false,
    error: {
      code:
        error instanceof CliError ? error.code : isParseArgsError(error) ? 'USAGE_ERROR' : 'FAILED',
      message,
    },
  };
}
