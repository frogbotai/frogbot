import type { Noun, RawVerb, Verb } from './command.js';
import { parseVerbArgs, runVerb, verbFlags, verbHelp, verbUsage } from './command.js';
import { reportStop } from './error.js';
import type { DojoIO } from './io.js';
import { jsonIO, processIO } from './io.js';
import { account } from './nouns/account.js';
import { activity } from './nouns/activity.js';
import { apiKeys } from './nouns/apiKeys.js';
import { apps } from './nouns/apps.js';
import { billing } from './nouns/billing.js';
import { deployments } from './nouns/deployments.js';
import { domains } from './nouns/domains.js';
import { env } from './nouns/env.js';
import { git } from './nouns/git.js';
import { handovers } from './nouns/handovers.js';
import { members } from './nouns/members.js';
import { projects } from './nouns/projects.js';
import { sharing } from './nouns/sharing.js';
import { templates } from './nouns/templates.js';
import { workspaces } from './nouns/workspaces.js';
import { daily } from './short.js';

/**
 * Every Dojo command: the daily ones that act on the folder's app, `login`, `logout` and `whoami`, then one noun per
 * Dojo resource.
 */
export const dojoCommands: Record<string, Verb | RawVerb | Noun> = {
  ...daily,
  ...account,
  workspaces,
  members,
  projects,
  apps,
  handovers,
  templates,
  deployments,
  git,
  env,
  domains,
  sharing,
  keys: apiKeys,
  billing,
  activity,
};

const helpFlags = new Set(['--help', '-h', 'help']);

const isNoun = (command: Verb | RawVerb | Noun): command is Noun => 'verbs' in command;

function list(entries: [string, { summary: string }][]): string[] {
  const width = Math.max(...entries.map(([name]) => name.length)) + 2;

  return entries.map(([name, { summary }]) => `  ${name.padEnd(width)}${summary}`);
}

function topHelp(program: string): string[] {
  const entries = Object.entries(dojoCommands);
  const dailyNames = new Set(Object.keys(daily));

  return [
    `Usage: ${program} <command> [--json]`,
    '',
    "Daily, on the folder's app (.frogbot/app.json) unless you name one:",
    ...list([
      ...entries.filter(([name]) => dailyNames.has(name)),
      ['env set KEY=value', { summary: "Set keys on the folder's app. It restarts once." }],
    ]),
    '',
    'Commands:',
    ...list(entries.filter(([name]) => !dailyNames.has(name))),
    '',
    `Run ${program} <command> --help for its verbs and flags. FROGBOT_DOJO_TOKEN signs in with an API key.`,
    'Without a terminal, a command that needs a sign-in exits 3 and one that needs a payment exits 4, with the link to hand on. --wait waits instead.',
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

function verbJSON(program: string, name: string, verb: Verb | RawVerb) {
  return {
    name,
    summary: verb.summary,
    usage: verbUsage(program, name, verb),
    flags: Object.entries(verbFlags(verb)).map(([flag, spec]) => ({
      name: `--${flag}`,
      type: spec.type,
      ...(spec.value && { value: spec.value }),
      help: spec.help,
    })),
  };
}

/** `--help --json`: every command, and each noun's verbs, with usage and flags, as one JSON value. */
export function helpJSON(program: string) {
  const dailyNames = new Set(Object.keys(daily));

  return {
    program,
    exitCodes: { 0: 'success', 1: 'failure', 2: 'usage', 3: 'sign-in needed', 4: 'payment needed' },
    commands: Object.entries(dojoCommands).map(([name, command]) =>
      isNoun(command)
        ? {
            name,
            summary: command.summary,
            verbs: Object.entries(command.verbs).map(([verb, spec]) =>
              verbJSON(program, `${name} ${verb}`, spec),
            ),
          }
        : { ...verbJSON(program, name, command), ...(dailyNames.has(name) && { daily: true }) },
    ),
  };
}

function print(io: DojoIO, lines: string[], to: 'stdout' | 'stderr'): void {
  io[to].write(`${lines.join('\n')}\n`);
}

function usageError(io: DojoIO, message: string, lines: string[], args: string[]): number {
  print(io, [`[frogbot] ${message}`, '', ...lines], 'stderr');

  if (args.includes('--json')) {
    print(
      io,
      [JSON.stringify({ ok: false, code: 'USAGE_ERROR', error: message }, null, 2)],
      'stdout',
    );
  }

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

  const json = args.includes('--json');
  const waits = args.includes('--wait');
  const rest = args.filter((arg) => arg !== '--json' && arg !== '--wait');
  const out = { ...(json ? jsonIO(io) : io), ...(waits && { waits }) };

  try {
    const usage = verbUsage(io.program, name, verb);

    if ('raw' in verb) {
      parseVerbArgs(verb, rest, usage);

      return await verb.raw(rest, out);
    }

    return await runVerb(verb, rest, out, usage);
  } catch (error) {
    return reportStop(out, error);
  }
}

/**
 * Runs `<program> <command> [<verb>] …` and returns its exit code: 0, 1, 2 for bad usage, 3 when it needs a sign-in
 * and 4 when it needs a payment that nobody is here for.
 */
export async function runDojo(args: string[], io: DojoIO): Promise<number> {
  const flags = args.includes('--json') ? ['--json'] : [];
  const [first, second, ...rest] = args.filter((arg) => arg !== '--json');
  const name = first?.toLowerCase();

  if (!name) return usageError(io, 'Name a command.', topHelp(io.program), args);

  if (helpFlags.has(name)) {
    print(
      io,
      flags.length ? [JSON.stringify(helpJSON(io.program), null, 2)] : topHelp(io.program),
      'stdout',
    );

    return 0;
  }

  const command = Object.hasOwn(dojoCommands, name) ? dojoCommands[name] : undefined;

  if (!command) {
    return usageError(io, `"${first}" isn't a Dojo command.`, topHelp(io.program), args);
  }

  if (!isNoun(command)) {
    return runCommand(
      name,
      command,
      [...(second === undefined ? [] : [second]), ...rest, ...flags],
      io,
    );
  }

  const verbName = second?.toLowerCase();

  if (!verbName) return usageError(io, `Name a verb.`, nounHelp(io.program, name, command), args);

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
      args,
    );
  }

  return runCommand(`${name} ${verbName}`, verb, [...rest, ...flags], io);
}

/** Runs one Dojo command line against the real terminal and sets `process.exitCode`. */
export async function runDojoCommand(args: string[], program: string): Promise<void> {
  process.exitCode = await runDojo(args, processIO(program));
}
