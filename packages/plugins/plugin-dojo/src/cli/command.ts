import { parseArgs } from 'node:util';

import type { DojoClient } from './dojo.js';
import { createDojo } from './dojo.js';
import { ShareError } from './error.js';
import type { DojoIO } from './io.js';

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
  /** Positionals in help and checks: `<app>` required, `[name]` optional, `<KEY>...` one or more. */
  args?: string;
  flags?: Record<string, VerbFlag>;
  /**
   * Destructive: asks this with a terminal, and needs `--yes` without one. `true` when `run` asks
   * itself, once it has looked up what it acts on.
   */
  confirm?: ((input: VerbInput) => string) | true;
  run: (input: VerbInput) => Promise<number | void>;
};

/** A verb that parses its own arguments, like `share`; `flags` only feed its help. */
export type RawVerb = Omit<Verb, 'run' | 'confirm'> & {
  raw: (args: string[], io: DojoIO) => Promise<number>;
  /** Gets `--json` and the real stdout as typed, because it writes its own JSON result, like `share`. */
  ownJson?: true;
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

function arity(args: string | undefined): { min: number; max: number } {
  const parts = args?.split(' ').filter(Boolean) ?? [];
  const required = parts.filter((part) => part.startsWith('<')).length;
  const variadic = parts.some((part) => part.endsWith('...'));

  return { min: required, max: variadic ? Infinity : parts.length };
}

/** Parses `args` against the verb, confirms a destructive one, and runs it. */
export async function runVerb(
  verb: Verb,
  args: string[],
  io: DojoIO,
  usage: string,
): Promise<number> {
  const flags = verbFlags(verb);
  const { json: _json, wait: _wait, ...options } = flags;
  let parsed;

  try {
    parsed = parseArgs({
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

  const { min, max } = arity(verb.args);
  const { positionals, values } = parsed;

  if (positionals.length < min || positionals.length > max) {
    throw new ShareError(`Usage: ${usage}`, 2);
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
  if (typeof verb.confirm === 'function') await input.confirm(verb.confirm(input));

  return (await verb.run(input)) ?? 0;
}
