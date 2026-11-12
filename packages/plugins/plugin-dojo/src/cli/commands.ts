import type { Noun, RawVerb, Verb } from './command.js';
import { runVerb, verbHelp, verbUsage } from './command.js';
import { reportStop } from './error.js';
import type { DojoIO } from './io.js';
import { jsonIO, processIO } from './io.js';
import { account } from './nouns/account.js';
import { apiKeys } from './nouns/apiKeys.js';
import { apps } from './nouns/apps.js';
import { billing } from './nouns/billing.js';
import { deployments } from './nouns/deployments.js';
import { domains } from './nouns/domains.js';
import { env } from './nouns/env.js';
import { members } from './nouns/members.js';
import { sharing } from './nouns/sharing.js';
import { workspaces } from './nouns/workspaces.js';

/** Every Dojo command: `login`, `logout` and `whoami`, then one noun per Dojo resource. */
export const dojoCommands: Record<string, Verb | RawVerb | Noun> = {
  ...account,
  workspaces,
  members,
  apps,
  deployments,
  env,
  domains,
  sharing,
  keys: apiKeys,
  billing,
};

const helpFlags = new Set(['--help', '-h', 'help']);

const isNoun = (command: Verb | RawVerb | Noun): command is Noun => 'verbs' in command;

function list(entries: [string, { summary: string }][]): string[] {
  const width = Math.max(...entries.map(([name]) => name.length)) + 2;

  return entries.map(([name, { summary }]) => `  ${name.padEnd(width)}${summary}`);
}

function topHelp(program: string): string[] {
  return [
    `Usage: ${program} <command> [--json]`,
    '',
    'Commands:',
    ...list(Object.entries(dojoCommands)),
    '',
    `Run ${program} <command> --help for its verbs and flags. FROGBOT_DOJO_TOKEN signs in with an API key.`,
  ];
}

function nounHelp(program: string, name: string, noun: Noun): string[] {
  return [
    `Usage: ${program} ${name} <verb> [--json]`,
    '',
    noun.summary,
    '',
    'Verbs:',
    ...list(Object.entries(noun.verbs)),
    '',
    `Run ${program} ${name} <verb> --help for its flags.`,
  ];
}

function print(io: DojoIO, lines: string[], to: 'stdout' | 'stderr'): void {
  io[to].write(`${lines.join('\n')}\n`);
}

function usageError(io: DojoIO, message: string, lines: string[]): number {
  print(io, [`[frogbot] ${message}`, '', ...lines], 'stderr');

  return 2;
}

async function runCommand(
  name: string,
  verb: Verb | RawVerb,
  args: string[],
  io: DojoIO,
): Promise<number> {
  if (args.some((arg) => arg === '--help' || arg === '-h')) {
    print(io, verbHelp(io.program, name, verb), 'stdout');

    return 0;
  }

  if ('raw' in verb && verb.ownJson) return verb.raw(args, io);

  const json = args.includes('--json');
  const rest = args.filter((arg) => arg !== '--json');
  const out = json ? jsonIO(io) : io;

  try {
    if ('raw' in verb) return await verb.raw(rest, out);

    return await runVerb(verb, rest, out, verbUsage(io.program, name, verb));
  } catch (error) {
    return reportStop(out, error);
  }
}

/** Runs `<program> <command> [<verb>] …` and returns its exit code: 0, 1, or 2 for bad usage. */
export async function runDojo(args: string[], io: DojoIO): Promise<number> {
  const [first, second, ...rest] = args;
  const name = first?.toLowerCase();

  if (!name) return usageError(io, 'Name a command.', topHelp(io.program));

  if (helpFlags.has(name)) {
    print(io, topHelp(io.program), 'stdout');

    return 0;
  }

  const command = Object.hasOwn(dojoCommands, name) ? dojoCommands[name] : undefined;

  if (!command) return usageError(io, `"${first}" isn't a Dojo command.`, topHelp(io.program));

  if (!isNoun(command)) return runCommand(name, command, args.slice(1), io);

  const verbName = second?.toLowerCase();

  if (!verbName) return usageError(io, `Name a verb.`, nounHelp(io.program, name, command));

  if (helpFlags.has(verbName)) {
    print(io, nounHelp(io.program, name, command), 'stdout');

    return 0;
  }

  const verb = Object.hasOwn(command.verbs, verbName) ? command.verbs[verbName] : undefined;

  if (!verb) {
    return usageError(
      io,
      `"${second}" isn't a verb of ${name}.`,
      nounHelp(io.program, name, command),
    );
  }

  return runCommand(`${name} ${verbName}`, verb, rest, io);
}

/** Runs one Dojo command line against the real terminal and sets `process.exitCode`. */
export async function runDojoCommand(args: string[], program: string): Promise<void> {
  process.exitCode = await runDojo(args, processIO(program));
}
