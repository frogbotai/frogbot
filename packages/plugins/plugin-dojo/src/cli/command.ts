import { parseArgs } from 'node:util';

import type { DojoClient } from './dojo.js';
import { createDojo } from './dojo.js';
import { ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { linkPath, readLink } from './link.js';
import { findApp } from './nouns/resolve.js';

/** A flag of one verb, as `node:util` `parseArgs` takes it, with its help line. */
export type VerbFlag = {
  type: 'string' | 'boolean';
  multiple?: boolean;
  /** The value's placeholder in help: `--role <role>`. */
  value?: string;
  help: string;
};

/** What a verb's `run` gets: its positionals and flags, already checked against its usage. */
export type VerbInput = {
  io: DojoIO;
  positionals: string[];
  values: Record<string, string | boolean | (string | boolean)[] | undefined>;
  /** One client for the whole command, made on first use. */
  dojo: () => DojoClient;
  /** Asks with a terminal and stops on "no"; passes with `--yes`; stops with exit 2 without either. */
  confirm: (message: string) => Promise<void>;
};

/** One command: `apps delete`, or `login`. */
export type Verb = {
  summary: string;
  /**
   * Positionals in help and checks: `<id>` required, `[name]` optional, `<KEY>...` one or more. A leading `[app]` is
   * the folder's app (`.frogbot/app.json`) when left out.
   */
  args?: string;
  /** For `[app] <x>...`: whether the first positional names the app rather than the first `<x>`. */
  appFirst?: (first: string) => boolean;
  flags?: Record<string, VerbFlag>;
  /**
   * Destructive: asks this with a terminal, and needs `--yes` without one. `true` when `run` asks
   * itself, once it has looked up what it acts on.
   */
  confirm?: ((input: VerbInput) => string) | true;
  run: (input: VerbInput) => Promise<number | void>;
};

/**
 * A verb that reads its own positionals, like `pull`. Its arguments are checked against `flags` first, the table
 * its help comes from, so a flag it reads but doesn't declare is refused instead of missing from `--help`.
 */
export type RawVerb = Omit<Verb, 'run' | 'confirm'> & {
  raw: (args: string[], io: DojoIO) => Promise<number>;
};

/** A noun's verbs: `apps` → `list`, `delete`, … */
export type Noun = { summary: string; verbs: Record<string, Verb | RawVerb> };

/** `--yes`, which every destructive verb gets. */
export const yesFlag: VerbFlag = {
  type: 'boolean',
  help: 'Skip the confirmation. Needed without a terminal.',
};

const jsonFlag: VerbFlag = { type: 'boolean', help: 'Print one JSON value on stdout.' };

const waitFlag: VerbFlag = {
  type: 'boolean',
  help: 'Wait for a sign-in or payment without a terminal, instead of exiting 3 or 4.',
};

/** A verb's flags as help lists them, with `--yes` on destructive verbs and `--json` and `--wait` on all. */
export function verbFlags(verb: Verb | RawVerb): Record<string, VerbFlag> {
  return {
    ...verb.flags,
    ...('confirm' in verb && verb.confirm && { yes: yesFlag }),
    json: jsonFlag,
    wait: waitFlag,
  };
}

function flagUsage(name: string, flag: VerbFlag): string {
  const value = flag.type === 'string' ? ` <${flag.value ?? name}>` : '';

  return `[--${name}${value}]${flag.multiple ? '...' : ''}`;
}

/** `frogbot dojo apps delete <app> [--yes] [--json]`. */
export function verbUsage(program: string, name: string, verb: Verb | RawVerb): string {
  const flags = Object.entries(verbFlags(verb)).map(([flag, spec]) => flagUsage(flag, spec));

  return [`${program} ${name}`, verb.args, ...flags].filter(Boolean).join(' ');
}

/** The verb's usage, summary and flags, for `--help`. */
export function verbHelp(program: string, name: string, verb: Verb | RawVerb): string[] {
  const flags = Object.entries(verbFlags(verb)).map(([flag, spec]) => {
    const value = spec.type === 'string' ? ` <${spec.value ?? flag}>` : '';

    return `  ${`--${flag}${value}`.padEnd(24)} ${spec.help}`;
  });

  return [`Usage: ${verbUsage(program, name, verb)}`, '', verb.summary, '', 'Flags:', ...flags];
}

/**
 * The app a verb acts on when `<app>` is left out: the folder's, from `.frogbot/app.json`. With none, a usage error
 * that says how to get one.
 */
export async function linkedApp(
  io: Pick<DojoIO, 'cwd' | 'program'>,
  usage: string,
): Promise<string> {
  const link = await readLink(io.cwd);

  if (!link) {
    throw new ShareError(
      `No app here: there's no ${linkPath}. Run this in a folder you deployed with frogbot deploy, or name the app. ${usage}`,
      2,
    );
  }

  return String(link.appId);
}

/** `positionals` with the folder's app put first when a verb's leading `[app]` was left out. */
export async function withApp(
  verb: Pick<Verb, 'args' | 'appFirst'>,
  positionals: string[],
  io: Pick<DojoIO, 'cwd' | 'program'>,
  usage: string,
): Promise<string[]> {
  const parts = verb.args?.split(' ').filter(Boolean) ?? [];

  if (parts[0] !== '[app]') return positionals;

  const variadic = parts.at(-1)?.endsWith('...') ?? false;
  const [first] = positionals;

  const given = variadic
    ? positionals.length >= parts.length && first !== undefined && (verb.appFirst?.(first) ?? true)
    : positionals.length >= parts.length;

  if (given || positionals.length < parts.length - 1) return positionals;

  return [await linkedApp(io, `Usage: ${usage}`), ...positionals];
}

function arity(args: string | undefined): { min: number; max: number; names: string[] } {
  const parts =
    args
      ?.replace(/^\[app\]/, '<app>')
      .split(' ')
      .filter(Boolean) ?? [];

  const required = parts.filter((part) => part.startsWith('<'));
  const variadic = parts.some((part) => part.endsWith('...'));

  return { min: required.length, max: variadic ? Infinity : parts.length, names: required };
}

/** Parses `args` against the verb's flags, the same table its help lists; an undeclared flag is a usage error. */
export function parseVerbArgs(verb: Verb | RawVerb, args: string[], usage: string) {
  const { json: _json, wait: _wait, ...options } = verbFlags(verb);

  try {
    return parseArgs({
      args,
      options: Object.fromEntries(
        Object.entries(options).map(([name, { type, multiple }]) => [
          name,
          { type, ...(multiple && { multiple }) },
        ]),
      ),
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw new ShareError(`${(error as Error).message} Usage: ${usage}`, 2);
  }
}

/** Parses `args` against the verb, confirms a destructive one, and runs it. */
export async function runVerb(
  verb: Verb,
  args: string[],
  io: DojoIO,
  usage: string,
): Promise<number> {
  const { positionals: given, values } = parseVerbArgs(verb, args, usage);
  const { min, max, names } = arity(verb.args);
  const positionals = await withApp(verb, given, io, usage);

  if (positionals.length < min || positionals.length > max) {
    throw new ShareError(`Usage: ${usage}`, 2);
  }

  const blank = positionals.slice(0, min).findIndex((value) => value.trim() === '');

  if (blank !== -1) {
    throw new ShareError(`${names[blank]} can't be blank. Usage: ${usage}`, 2);
  }

  let client: DojoClient | undefined;
  const confirmed = values.yes === true;

  const refuseWithoutTerminal = () => {
    if (!confirmed && !io.isTTY) {
      throw new ShareError(
        `There's no terminal to confirm in: rerun with --yes. Usage: ${usage}`,
        2,
      );
    }
  };

  const input: VerbInput = {
    io,
    positionals,
    values,
    dojo: () => (client ??= createDojo(io)),
    confirm: async (message) => {
      refuseWithoutTerminal();

      if (!confirmed && !(await io.prompts.confirm(message))) throw new ShareError('Cancelled.');
    },
  };

  if (verb.confirm) refuseWithoutTerminal();

  if (typeof verb.confirm === 'function') {
    if (positionals !== given && !confirmed) {
      positionals[0] = (await findApp(input.dojo(), positionals[0] ?? '')).slug;
    }

    await input.confirm(verb.confirm(input));
  }

  return (await verb.run(input)) ?? 0;
}
