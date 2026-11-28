import { readFileSync } from 'node:fs';

import type { CLICommand } from '../config/types.js';
import { commandDocs, contributingGroup, coreGroups, pluginGroup, usageFlags } from './help.js';

/** The installed `frogbot` package's version. */
export const version: string = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

type Entry = { name: string; summary?: string; usage?: string; flags: string[] };

type Group = { name: string; commands: Entry[] };

const exitCodes = {
  0: 'success',
  1: 'failure',
  2: 'usage error',
  3: 'sign-in needed',
  4: 'payment needed',
};

function entry(name: string, { summary, usage }: { summary?: string; usage?: string }): Entry {
  return {
    name,
    ...(summary && { summary }),
    ...(usage && { usage: `frogbot ${usage}` }),
    flags: usage ? usageFlags(usage) : [],
  };
}

/** Every command in `frogbot --help`'s order: the built-ins by group, then plugin commands, then contributing. */
export function commandGroups(appCommands: Record<string, CLICommand>): Group[] {
  const groups = new Map<string, Entry[]>(
    [...coreGroups, contributingGroup].map((name) => [name, []]),
  );

  const plugins = new Map<string, Entry[]>();

  for (const [name, doc] of Object.entries(commandDocs)) {
    groups
      .get(doc.group)
      ?.push(entry(name, Object.hasOwn(appCommands, name) ? appCommands[name] : doc));
  }

  for (const [name, command] of Object.entries(appCommands)) {
    if (Object.hasOwn(commandDocs, name)) continue;

    const group = command.group ?? pluginGroup;

    plugins.set(group, [...(plugins.get(group) ?? []), entry(name, command)]);
  }

  const ordered = [
    ...coreGroups.map((name) => [name, groups.get(name)!] as const),
    ...[...plugins].sort(([a], [b]) => (a === pluginGroup ? 1 : b === pluginGroup ? -1 : 0)),
    [contributingGroup, groups.get(contributingGroup)!] as const,
  ];

  return ordered.map(([name, commands]) => ({ name, commands }));
}

/** What `frogbot`, `frogbot help` and `frogbot --help` print. */
export function overview(appCommands: Record<string, CLICommand>): string {
  const groups = commandGroups(appCommands);
  const width = Math.max(...groups.flatMap((group) => group.commands.map((c) => c.name.length)));

  return [
    `FrogBot ${version}. Usage: frogbot <command> [options]`,
    ...groups.flatMap(({ name, commands }) => [
      '',
      name,
      ...commands.map(({ name: command, summary }) =>
        `  ${command.padEnd(width)}  ${summary ?? ''}`.trimEnd(),
      ),
    ]),
    '',
    '`frogbot <command> --help` prints its flags; `frogbot help --json` prints every command as JSON.',
    'Exit codes: 0 success, 1 failure, 2 usage error, 3 sign-in needed, 4 payment needed.',
  ].join('\n');
}

/** What `frogbot help --json` prints: one object with every command, its usage and its flags. */
export function overviewJson(appCommands: Record<string, CLICommand>) {
  return {
    command: 'help',
    success: true,
    version,
    usage: 'frogbot <command> [options]',
    exitCodes,
    groups: commandGroups(appCommands),
  };
}

/** What `frogbot <command> --help --json` prints: the command's entry from `help --json`, with its help text. */
export function commandHelpJson(
  name: string,
  appCommands: Record<string, CLICommand>,
  help: string,
) {
  const found = commandGroups(appCommands)
    .flatMap(({ commands }) => commands)
    .find((command) => command.name === name);

  return {
    command: name,
    success: true,
    ...(found?.summary && { summary: found.summary }),
    ...(found?.usage && { usage: found.usage }),
    flags: found?.flags ?? [],
    help,
  };
}
